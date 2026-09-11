"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CATALOG_CATEGORIES, PRICING_MODES } from "@/lib/catalog/types";
import { BILLING_TYPES, SERVICE_STATUSES, type ActionResult } from "@/lib/services/types";
import { isUuid, parseMoney } from "@/lib/services/pricing";
import { REVENUE_CATEGORIES } from "@/lib/supabase/types";

const text = (fd: FormData,key:string,max=4000) => String(fd.get(key) ?? "").trim().slice(0,max);
const checked = (fd:FormData,key:string) => fd.get(key)==="on";
function validSlug(value:string){ return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
async function access(){ const session=await getAdminUser(); if(!session || !["owner","admin"].includes(session.admin.role)) throw new Error("You do not have permission to manage packages."); return createSupabaseServerClient(); }
function refresh(id?:string){ ["/admin/packages","/admin/services","/admin/catalog","/services","/website-intake","/get-started","/services/ai-business-operator","/services/grow-your-audience","/services/run-your-business"].forEach(path=>revalidatePath(path)); if(id) revalidatePath(`/admin/packages/${id}`); }
function errorResult(error:unknown):ActionResult { const message=error instanceof Error?error.message:"Package save failed."; return {error:message.includes("duplicate")||message.includes("23505")?"That package slug or name is already in use.":message}; }

export async function saveCatalogPackage(_state:ActionResult,fd:FormData):Promise<ActionResult>{
  try {
    const db=await access(); const id=text(fd,"id",40)||null; if(id&&!isUuid(id)) throw new Error("Invalid package.");
    const name=text(fd,"name",120); const slug=text(fd,"slug",120); if(!name) throw new Error("Package name is required."); if(!validSlug(slug)) throw new Error("Use a lowercase URL slug with letters, numbers, and hyphens.");
    const catalogCategory=text(fd,"catalog_category",60); const revenueCategory=text(fd,"category",60); const pricingMode=text(fd,"pricing_mode",30); const billingType=text(fd,"billing_type",30); const status=text(fd,"status",20);
    if(!(CATALOG_CATEGORIES as readonly string[]).includes(catalogCategory)||(REVENUE_CATEGORIES as readonly string[]).includes(revenueCategory)===false||(PRICING_MODES as readonly string[]).includes(pricingMode)===false||(BILLING_TYPES as readonly string[]).includes(billingType)===false||(SERVICE_STATUSES as readonly string[]).includes(status)===false) throw new Error("Choose valid package settings.");
    const interval=text(fd,"billing_interval",20); if(!["monthly","quarterly","yearly","custom"].includes(interval)) throw new Error("Choose a valid billing interval.");
    const position=Number(text(fd,"position")); if(!Number.isInteger(position)||position<0||position>100000) throw new Error("Display order must be a positive whole number.");
    const locations=text(fd,"frontend_locations",2000).split(/[\n,]/).map(x=>x.trim()).filter(Boolean).slice(0,30);
    const relationships=fd.getAll("service_ids").map((value,index)=>{ const serviceId=String(value); if(!isUuid(serviceId)) throw new Error("Invalid included service."); return {service_id:serviceId,included:true,feature_label:text(fd,`feature_label_${serviceId}`,200),feature_description:text(fd,`feature_description_${serviceId}`,1000),sort_order:Number(text(fd,`sort_order_${serviceId}`))||index*10}; });
    const publicEnabled=checked(fd,"public_enabled"); if(publicEnabled && status==="active" && (!text(fd,"cta_route",500)||!name)) throw new Error("A public active package needs a CTA route and display name.");
    const payload={name,slug,catalog_category:catalogCategory,category:revenueCategory,subtitle:text(fd,"subtitle",200)||null,short_description:text(fd,"short_description",500)||null,description:text(fd,"description",4000)||null,image_url:text(fd,"image_url",1000)||null,image_alt:text(fd,"image_alt",240)||null,icon_key:text(fd,"icon_key",80)||null,pricing_mode:pricingMode,from_cents:pricingMode==="free"?0:parseMoney(text(fd,"price")),setup_fee_cents:parseMoney(text(fd,"setup_fee")),billing_type:pricingMode==="custom_quote"?"custom_quote":billingType,billing_interval:interval,interval_months:interval==="yearly"?12:interval==="quarterly"?3:1,badge:text(fd,"badge",80)||null,most_popular:checked(fd,"most_popular"),featured:checked(fd,"featured"),status,position,cta_label:text(fd,"cta_label",100)||"Get Started",cta_route:text(fd,"cta_route",500)||"/contact",public_route:text(fd,"public_route",500)||null,meta_title:text(fd,"meta_title",180)||null,meta_description:text(fd,"meta_description",320)||null,frontend_locations:locations,catalog_enabled:checked(fd,"catalog_enabled"),proposal_enabled:checked(fd,"proposal_enabled"),intake_enabled:checked(fd,"intake_enabled"),internal_sales_enabled:checked(fd,"internal_sales_enabled"),public_enabled:publicEnabled,manual_invoice_enabled:checked(fd,"manual_invoice_enabled"),requires_quote:pricingMode==="custom_quote"};
    const {data:saved,error}=await db.rpc("save_package",{p_id:id,p_data:payload,p_relationships:relationships,p_expected:text(fd,"updated_at")||null}); if(error) throw new Error(error.message);
    const file=fd.get("image_file");
    if(file instanceof File && file.size){ if(file.size>6*1024*1024||!file.type.startsWith("image/")) throw new Error("Choose an image file up to 6 MB."); const ext=(file.name.split(".").pop()||"webp").replace(/[^a-z0-9]/gi,"").toLowerCase(); const path=`catalog/${saved}/${crypto.randomUUID()}.${ext}`; const storage=supabaseAdmin().storage.from("brand-assets"); const uploaded=await storage.upload(path,file,{contentType:file.type,upsert:false}); if(uploaded.error) throw new Error("The package saved, but its image upload failed."); const current=await db.from("catalog_items").select("image_path").eq("id",saved).single(); await db.from("catalog_items").update({image_path:path,image_url:null}).eq("id",saved); if(current.data?.image_path) await storage.remove([current.data.image_path]); }
    refresh(saved); return {success:"Package saved.",id:saved};
  } catch(error){ return errorResult(error); }
}

export async function archiveCatalogPackage(_state:ActionResult,fd:FormData):Promise<ActionResult>{ try{ const db=await access(); const id=text(fd,"id",40); if(!isUuid(id)) throw new Error("Invalid package."); const {error}=await db.from("catalog_items").update({status:"retired",public_enabled:false,archived_at:new Date().toISOString()}).eq("id",id).eq("offer_kind","package"); if(error) throw error; refresh(id); return {success:"Package archived. Historical references were preserved."}; }catch(error){return errorResult(error);} }

export async function removeCatalogImage(_state:ActionResult,fd:FormData):Promise<ActionResult>{ try{ const db=await access(); const id=text(fd,"id",40); if(!isUuid(id)) throw new Error("Invalid package."); const {data}=await db.from("catalog_items").select("image_path").eq("id",id).eq("offer_kind","package").single(); if(data?.image_path) await supabaseAdmin().storage.from("brand-assets").remove([data.image_path]); const {error}=await db.from("catalog_items").update({image_path:null,image_url:null}).eq("id",id); if(error) throw error; refresh(id); return {success:"Package image removed."}; }catch(error){return errorResult(error);} }

export async function createPackageAndOpen(){ const session=await getAdminUser(); if(!session||!["owner","admin"].includes(session.admin.role)) redirect("/admin/packages"); redirect("/admin/packages/new"); }
