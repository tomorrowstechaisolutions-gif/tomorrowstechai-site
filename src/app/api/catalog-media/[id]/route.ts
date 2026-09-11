import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){if(!supabaseConfigured())return new NextResponse(null,{status:404});const {id}=await params;const db=supabaseAdmin();const {data:pkg}=await db.from("catalog_items").select("image_path,status,public_enabled,offer_kind").eq("id",id).maybeSingle();if(!pkg?.image_path||pkg.offer_kind!=="package"||pkg.status!=="active"||!pkg.public_enabled)return new NextResponse(null,{status:404});const {data,error}=await db.storage.from("brand-assets").download(pkg.image_path);if(error||!data)return new NextResponse(null,{status:404});return new NextResponse(await data.arrayBuffer(),{headers:{"Content-Type":data.type||"image/webp","Cache-Control":"public, max-age=300, stale-while-revalidate=86400"}});}
