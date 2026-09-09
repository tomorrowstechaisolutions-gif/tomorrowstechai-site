import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getAdminUser } from '@/lib/supabase/server';
import { isUuid } from '@/lib/services/pricing';

export const runtime = 'nodejs';

const BUCKET = 'service-ad-creatives';
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

type RouteContext = { params: Promise<{ id: string }> };

async function serviceId(context: RouteContext) {
  const { id } = await context.params;
  return isUuid(id) ? id : null;
}

function isExpectedImage(bytes: Uint8Array, mime: string) {
  if (mime === 'image/png') return bytes.length >= 8 && bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]);
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  const id = await serviceId(context);
  if (!id) return NextResponse.json({ error: 'Invalid service.' }, { status: 400 });

  const db = await createSupabaseServerClient();
  const { data: service, error: serviceError } = await db
    .from('catalog_items')
    .select('name,ad_image_path')
    .eq('id', id)
    .maybeSingle();
  if (serviceError || !service?.ad_image_path) return NextResponse.json({ error: 'No ad creative.' }, { status: 404 });

  const download = new URL(request.url).searchParams.get('download') === '1';
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(
    service.ad_image_path,
    60,
    download ? { download: `${service.name}-ad-creative` } : undefined,
  );
  if (error || !data) return NextResponse.json({ error: 'Could not load the ad creative.' }, { status: 502 });
  return NextResponse.redirect(data.signedUrl, { status: 307, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAdminUser();
  if (!session || !['owner', 'admin'].includes(session.admin.role)) {
    return NextResponse.json({ error: 'You do not have permission to change service creatives.' }, { status: 403 });
  }
  const id = await serviceId(context);
  if (!id) return NextResponse.json({ error: 'Invalid service.' }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  const extension = EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: 'Use a PNG, JPG, or WebP image.' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The image must be 10MB or smaller.' }, { status: 413 });
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isExpectedImage(signature, file.type)) return NextResponse.json({ error: 'The file contents do not match its image type.' }, { status: 415 });

  const db = await createSupabaseServerClient();
  const { data: service, error: serviceError } = await db
    .from('catalog_items')
    .select('ad_image_path')
    .eq('id', id)
    .maybeSingle();
  if (serviceError || !service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });

  const path = `${id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: 'The image could not be uploaded.' }, { status: 502 });

  const { data: updated, error: updateError } = await db
    .from('catalog_items')
    .update({ ad_image_path: path })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (updateError || !updated) {
    await db.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: 'The image uploaded but could not be attached to the service.' }, { status: 500 });
  }

  if (service.ad_image_path) {
    const { error: removeError } = await db.storage.from(BUCKET).remove([service.ad_image_path]);
    if (removeError) console.error('[service-ad] old creative cleanup failed:', removeError.message);
  }
  return NextResponse.json({ success: true, path });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getAdminUser();
  if (!session || !['owner', 'admin'].includes(session.admin.role)) {
    return NextResponse.json({ error: 'You do not have permission to change service creatives.' }, { status: 403 });
  }
  const id = await serviceId(context);
  if (!id) return NextResponse.json({ error: 'Invalid service.' }, { status: 400 });

  const db = await createSupabaseServerClient();
  const { data: service, error: serviceError } = await db
    .from('catalog_items')
    .select('ad_image_path')
    .eq('id', id)
    .maybeSingle();
  if (serviceError || !service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
  if (!service.ad_image_path) return NextResponse.json({ success: true });

  const { data: updated, error: updateError } = await db
    .from('catalog_items')
    .update({ ad_image_path: null })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (updateError || !updated) return NextResponse.json({ error: 'The image could not be removed.' }, { status: 500 });

  const { error: removeError } = await db.storage.from(BUCKET).remove([service.ad_image_path]);
  if (removeError) console.error('[service-ad] creative cleanup failed:', removeError.message);
  return NextResponse.json({ success: true });
}
