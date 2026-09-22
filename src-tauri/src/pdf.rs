use crate::library::Library;
use lopdf::{dictionary, Document, Object, Stream};
use serde_json::Value;
use serde_json::json;
use std::{collections::HashSet,fs, path::{Path,PathBuf}, sync::{Mutex,OnceLock}, time::{SystemTime,UNIX_EPOCH}};
use pdfium_render::prelude::*;

static PDF_LOCK: Mutex<()> = Mutex::new(());
static PDF_INIT: OnceLock<Result<(),String>> = OnceLock::new();
fn pdfium()->Result<Pdfium,String>{
    PDF_INIT.get_or_init(||{
        let path=std::env::var_os("KEYE_PDFIUM_PATH").map(PathBuf::from)
            .or_else(||std::env::current_exe().ok().map(|p|p.with_file_name("pdfium.dll")))
            .ok_or("无法定位 PDF 渲染组件。")?;
        let bindings=Pdfium::bind_to_library(&path).map_err(|e|format!("无法加载 PDF 渲染组件 {}：{e}",path.display()))?;
        drop(Pdfium::new(bindings));
        Ok(())
    }).clone()?;
    Ok(Pdfium::default())
}

pub fn import_pdf_with_progress<F>(lib:&Library, source:&Path, course_id:Option<&str>, mut progress:F)->Result<Value,String>
where F:FnMut(usize,usize)->Result<(),String>{
    let _guard=PDF_LOCK.lock().map_err(|_|"PDF 渲染器无法使用。".to_string())?;
    let pdfium=pdfium()?;
    let mid=uuid::Uuid::new_v4().simple().to_string();
    let dir=lib.root.join("materials").join(&mid);
    fs::create_dir(&dir).map_err(|e|e.to_string())?;
    let result=(||{
        let original=dir.join("original.pdf");fs::copy(source,&original).map_err(|e|e.to_string())?;
        let doc=pdfium.load_pdf_from_file(&original,None).map_err(|e|e.to_string())?;
        if doc.pages().is_empty(){return Err("PDF 中没有页面。".into());}
        let cfg=PdfRenderConfig::new().set_target_width(1600).set_maximum_height(1600);
        let mut records=Vec::new();
        for (i,page) in doc.pages().iter().enumerate(){
            let image=page.render_with_config(&cfg).map_err(|e|e.to_string())?.as_image().map_err(|e|e.to_string())?.into_rgb8();
            let preview=dir.join(format!("{:05}-preview.jpg",i+1));
            let thumb=dir.join(format!("{:05}-thumb.jpg",i+1));
            image.save_with_format(&preview,image::ImageFormat::Jpeg).map_err(|e|e.to_string())?;
            image::DynamicImage::ImageRgb8(image).thumbnail(480,360).save_with_format(&thumb,image::ImageFormat::Jpeg).map_err(|e|e.to_string())?;
            records.push(json!({"original":format!("materials/{mid}/original.pdf"),"pdfPage":i,"preview":format!("materials/{mid}/{:05}-preview.jpg",i+1),"thumb":format!("materials/{mid}/{:05}-thumb.jpg",i+1)}));
            progress(i+1,doc.pages().len() as usize)?;
        }
        let title=source.file_stem().and_then(|s|s.to_str()).unwrap_or("本地 PDF");
        let day=chrono::Local::now().format("%Y-%m-%d").to_string();
        let touched=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
        let m=json!({"id":mid,"title":title,"topic":"本地资料","day":day,"pages":records.len(),"files":records,"sourceKey":format!("local:{mid}"),"source":"import","kind":"pdf","courseId":course_id,
            "excluded":[],"edited":false,"exported":false,"revision":0,"reviewRevision":null,"exportRevision":null,"exportName":"","exportPath":"","lastPage":1,"deleted":false,"touched":touched});
        lib.put_material(&m)?;
        Ok(m)
    })();
    if result.is_err(){let _=fs::remove_dir_all(dir);}
    result
}

pub fn export_original_pdf(lib:&Library,material:&Value,destination:&Path)->Result<(),String>{
    let _guard=PDF_LOCK.lock().map_err(|_|"PDF 渲染器无法使用。".to_string())?;
    let pdfium=pdfium()?;
    let rel=material["files"][0]["original"].as_str().ok_or("原始 PDF 路径无效。")?;
    let original=lib.root.join(rel);
    let doc=pdfium.load_pdf_from_file(&original,None).map_err(|e|e.to_string())?;
    let total=doc.pages().len() as usize;
    let excluded=material["excluded"].as_array().ok_or("页面状态无效。")?;
    if excluded.len()>=total{return Err("至少保留一页后才能导出。".into());}
    for i in (0..total).rev(){if excluded.iter().any(|v|v.as_u64()==Some((i+1) as u64)){
        doc.pages().get(i as i32).map_err(|e|e.to_string())?.delete().map_err(|e|e.to_string())?;
    }}
    let temporary=destination.with_extension("pdf.part");
    doc.save_to_file(&temporary).map_err(|e|e.to_string())?;
    fs::rename(temporary,destination).map_err(|e|e.to_string())?;
    Ok(())
}

pub fn export_combined(lib:&Library,materials:&[Value],destination:&Path)->Result<(),String>{
    let _guard=PDF_LOCK.lock().map_err(|_|"PDF 渲染器无法使用。".to_string())?;
    let pdfium=pdfium()?;
    let mut combined=pdfium.create_new_pdf().map_err(|e|e.to_string())?;
    let temporary_dir=lib.root.join("temporary");fs::create_dir_all(&temporary_dir).map_err(|e|e.to_string())?;
    let mut bookmarks=Vec::<(String,u32)>::new();
    for material in materials {
        let kept:Vec<usize>=(1..=material["pages"].as_u64().unwrap_or(0) as usize)
            .filter(|i|!material["excluded"].as_array().into_iter().flatten().any(|v|v.as_u64()==Some(*i as u64))).collect();
        if kept.is_empty(){return Err("选中的课件中存在没有保留页面的课件。".into());}
        let first=(combined.pages().len()+1) as u32;
        let title=format!("{} · {}",material["day"].as_str().unwrap_or(""),material["title"].as_str().unwrap_or("课件"));
        let source=if material["kind"]=="pdf" {
            lib.root.join(material["files"][0]["original"].as_str().ok_or("原始 PDF 路径无效。")?)
        }else{
            let path=temporary_dir.join(format!("{}.pdf",material["id"].as_str().unwrap_or("images")));
            export_images(lib,material,&path)?;path
        };
        let document=pdfium.load_pdf_from_file(&source,None).map_err(|e|e.to_string())?;
        let range=if material["kind"]=="pdf" {kept.iter().map(usize::to_string).collect::<Vec<_>>().join(",")}else{format!("1-{}",kept.len())};
        let offset=combined.pages().len();
        combined.pages_mut().copy_pages_from_document(&document,&range,offset).map_err(|e|e.to_string())?;
        bookmarks.push((title,first));
        if material["kind"]!="pdf"{let _=fs::remove_file(source);}
    }
    let staged=destination.with_extension("pdf.part");
    combined.save_to_file(&staged).map_err(|e|e.to_string())?;
    drop(combined);
    let mut doc=Document::load(&staged).map_err(|e|e.to_string())?;
    let pages=doc.get_pages();
    for (title,page) in bookmarks {if let Some(object)=pages.get(&page){doc.add_bookmark(lopdf::Bookmark::new(title,[0.12,0.34,0.29],0,*object),None);}}
    if let Some(outline)=doc.build_outline(){
        let root=doc.trailer.get(b"Root").map_err(|e|e.to_string())?.as_reference().map_err(|e|e.to_string())?;
        doc.get_object_mut(root).map_err(|e|e.to_string())?.as_dict_mut().map_err(|e|e.to_string())?.set("Outlines",outline);
    }
    doc.save(&staged).map_err(|e|e.to_string())?;
    fs::rename(staged,destination).map_err(|e|e.to_string())?;
    Ok(())
}

pub fn export_images(lib:&Library, material:&Value, destination:&Path)->Result<(),String>{
    let files=material["files"].as_array().ok_or("课件页面数据损坏。")?;
    let excluded:HashSet<u64>=material["excluded"].as_array().into_iter().flatten().filter_map(Value::as_u64).collect();
    let mut doc=Document::with_version("1.5");
    let pages_id=doc.new_object_id();
    let mut page_ids=Vec::new();
    for (i,record) in files.iter().enumerate(){
        if excluded.contains(&((i+1) as u64)){continue;}
        let relative=record["preview"].as_str().ok_or("页面路径无效。")?;
        let path=lib.root.join(relative);
        let (width,height)=image::image_dimensions(&path).map_err(|e|e.to_string())?;
        let jpg=fs::read(&path).map_err(|e|e.to_string())?;
        let image_id=doc.add_object(Stream::new(dictionary!{
            "Type"=>"XObject","Subtype"=>"Image","Width"=>width as i64,"Height"=>height as i64,
            "ColorSpace"=>"DeviceRGB","BitsPerComponent"=>8,"Filter"=>"DCTDecode"
        },jpg));
        let w=(width as f64*0.75).max(1.0);
        let h=(height as f64*0.75).max(1.0);
        let content=format!("q {w:.3} 0 0 {h:.3} 0 0 cm /Im0 Do Q");
        let contents_id=doc.add_object(Stream::new(dictionary!{},content.into_bytes()));
        let resources_id=doc.add_object(dictionary!{"XObject"=>dictionary!{"Im0"=>image_id}});
        let page_id=doc.add_object(dictionary!{
            "Type"=>"Page","Parent"=>pages_id,"MediaBox"=>vec![Object::Integer(0),Object::Integer(0),Object::Real(w as f32),Object::Real(h as f32)],
            "Contents"=>contents_id,"Resources"=>resources_id
        });
        page_ids.push(page_id);
    }
    if page_ids.is_empty(){return Err("至少保留一页后才能导出。".into());}
    doc.objects.insert(pages_id,Object::Dictionary(dictionary!{"Type"=>"Pages","Kids"=>page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),"Count"=>page_ids.len() as i64}));
    let catalog_id=doc.add_object(dictionary!{"Type"=>"Catalog","Pages"=>pages_id});
    doc.trailer.set("Root",catalog_id);
    let temporary=destination.with_extension("pdf.part");
    doc.save(&temporary).map_err(|e|e.to_string())?;
    fs::rename(&temporary,destination).map_err(|e|e.to_string())?;
    Ok(())
}
