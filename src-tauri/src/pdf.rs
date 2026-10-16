use crate::library::Library;
use lopdf::{dictionary, Dictionary, Document, Object, Stream};
use serde_json::Value;
use serde_json::json;
use std::{collections::{HashMap,HashSet},fs, path::{Path,PathBuf}, sync::{Mutex,OnceLock}, time::{SystemTime,UNIX_EPOCH}};
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

// 读取归一化裁剪矩形，键为 1 起的页码；无法解析的条目按“没有裁剪”处理。
fn material_crops(material:&Value)->HashMap<u64,[f64;4]>{
    material["crops"].as_object().into_iter().flatten().filter_map(|(key,value)|{
        let page=key.parse::<u64>().ok()?;
        let values=value.as_array()?;
        if values.len()!=4 {return None;}
        let rect=[values[0].as_f64()?,values[1].as_f64()?,values[2].as_f64()?,values[3].as_f64()?];
        (page>=1&&rect.iter().all(|v|v.is_finite())).then_some((page,rect))
    }).collect()
}

// 图片类导出的像素裁剪矩形：按图片实际宽高换算、四舍五入、钳制到图片范围内、至少 1×1 像素。
fn pixel_crop(width:u32,height:u32,crop:[f64;4])->(u32,u32,u32,u32){
    let x=((crop[0]*width as f64).round() as i64).clamp(0,(width.max(1)-1) as i64) as u32;
    let y=((crop[1]*height as f64).round() as i64).clamp(0,(height.max(1)-1) as i64) as u32;
    let w=((crop[2]*width as f64).round() as i64).max(1).min((width-x) as i64) as u32;
    let h=((crop[3]*height as f64).round() as i64).max(1).min((height-y) as i64) as u32;
    (x,y,w,h)
}

// 把显示方向的归一化裁剪矩形映射为 CropBox；MediaBox 原点必须是 (0,0)。
fn crop_box(width:f64,height:f64,rotate:i64,crop:[f64;4])->Option<[f64;4]>{
    let (cx,cy,cw,ch)=(crop[0],crop[1],crop[2],crop[3]);
    let rect=match rotate {
        0=>[cx*width,height-(cy+ch)*height,(cx+cw)*width,height-cy*height],
        90=>[cy*width,cx*height,(cy+ch)*width,(cx+cw)*height],
        180=>[width-(cx+cw)*width,height-(cy+ch)*height,width-cx*width,height-cy*height],
        270=>[width-(cy+ch)*width,height-(cx+cw)*height,width-cy*width,height-cx*height],
        _=>return None,
    };
    rect.iter().all(|v|v.is_finite()).then_some(rect)
}

// MediaBox、Rotate、CropBox 都可能写在祖先 Pages 节点上，这里沿 Parent 链向上查找。
fn inherited<'a>(doc:&'a Document,mut dict:&'a Dictionary,key:&[u8])->Option<&'a Object>{
    for _ in 0..64 {
        if let Ok(value)=dict.get(key){return Some(value);}
        dict=doc.get_dictionary(dict.get(b"Parent").ok()?.as_reference().ok()?).ok()?;
    }
    None
}
fn numbers(object:&Object)->Option<Vec<f64>>{object.as_array().ok()?.iter().map(|v|v.as_float().ok().map(f64::from)).collect()}

// 给单页设置 CropBox；无法安全映射时跳过该页，不影响整份导出。
fn set_crop_box(doc:&mut Document,page_id:lopdf::ObjectId,crop:[f64;4]){
    let Ok(page)=doc.get_dictionary(page_id) else {return;};
    let Some(media)=inherited(doc,page,b"MediaBox").and_then(numbers).filter(|v|v.len()==4) else {return;}; // MediaBox 缺失，跳过
    if media[0]!=0.0||media[1]!=0.0 {return;} // MediaBox 原点不是 (0,0)，跳过
    let (width,height)=(media[2]-media[0],media[3]-media[1]);
    if width<=0.0||height<=0.0 {return;} // MediaBox 尺寸无效，跳过
    if let Some(existing)=inherited(doc,page,b"CropBox").and_then(numbers).filter(|v|v.len()==4) {
        if existing.iter().zip(&media).any(|(a,b)|(a-b).abs()>0.01) {return;} // 页面已有不兼容的 CropBox，跳过
    }
    let rotate=inherited(doc,page,b"Rotate").and_then(|v|v.as_float().ok()).map(|v|((v.round() as i64)%360+360)%360).unwrap_or(0);
    let Some(rect)=crop_box(width,height,rotate,crop) else {return;}; // Rotate 不是 0|90|180|270，跳过
    if let Ok(page)=doc.get_dictionary_mut(page_id){page.set("CropBox",vec![Object::Real(rect[0] as f32),Object::Real(rect[1] as f32),Object::Real(rect[2] as f32),Object::Real(rect[3] as f32)]);}
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
            "excluded":[],"crops":{},"edited":false,"exported":false,"revision":0,"reviewRevision":null,"exportRevision":null,"exportName":"","exportPath":"","lastPage":1,"deleted":false,"touched":touched});
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
    let kept:Vec<u64>=(1..=total as u64).filter(|page|!excluded.iter().any(|v|v.as_u64()==Some(*page))).collect();
    let temporary=destination.with_extension("pdf.part");
    doc.save_to_file(&temporary).map_err(|e|e.to_string())?;
    drop(doc);
    let crops=material_crops(material);
    if !crops.is_empty() {
        let mut result=Document::load(&temporary).map_err(|e|e.to_string())?;
        let pages=result.get_pages();
        for (index,page) in kept.iter().enumerate(){
            let Some(crop)=crops.get(page) else {continue;}; // 没有裁剪的页不动
            if let Some(object)=pages.get(&((index+1) as u32)){set_crop_box(&mut result,*object,*crop);} // 删除被排除页后页码重排，这里按保留顺序映射回原页码
        }
        result.save(&temporary).map_err(|e|e.to_string())?;
    }
    fs::rename(temporary,destination).map_err(|e|e.to_string())?;
    Ok(())
}

pub fn export_combined(lib:&Library,materials:&[Value],destination:&Path)->Result<(),String>{
    let _guard=PDF_LOCK.lock().map_err(|_|"PDF 渲染器无法使用。".to_string())?;
    let pdfium=pdfium()?;
    let mut combined=pdfium.create_new_pdf().map_err(|e|e.to_string())?;
    let temporary_dir=lib.root.join("temporary");fs::create_dir_all(&temporary_dir).map_err(|e|e.to_string())?;
    let mut bookmarks=Vec::<(String,u32)>::new();
    let mut crop_jobs=Vec::<(u32,[f64;4])>::new();
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
        if material["kind"]=="pdf" {
            // 图片类课件在临时 export_images 里已经裁剪；PDF 类课件按保留顺序把合并后的页码映射回原页码。
            let crops=material_crops(material);
            for (index,page) in kept.iter().enumerate(){
                if let Some(crop)=crops.get(&(*page as u64)){crop_jobs.push(((offset as usize+index+1) as u32,*crop));}
            }
        }
        bookmarks.push((title,first));
        if material["kind"]!="pdf"{let _=fs::remove_file(source);}
    }
    let staged=destination.with_extension("pdf.part");
    combined.save_to_file(&staged).map_err(|e|e.to_string())?;
    drop(combined);
    let mut doc=Document::load(&staged).map_err(|e|e.to_string())?;
    let pages=doc.get_pages();
    for (page,crop) in crop_jobs {if let Some(object)=pages.get(&page){set_crop_box(&mut doc,*object,crop);}}
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
    let crops=material_crops(material);
    let mut doc=Document::with_version("1.5");
    let pages_id=doc.new_object_id();
    let mut page_ids=Vec::new();
    for (i,record) in files.iter().enumerate(){
        if excluded.contains(&((i+1) as u64)){continue;}
        let relative=record["preview"].as_str().ok_or("页面路径无效。")?;
        let path=lib.root.join(relative);
        let (jpg,width,height)=match crops.get(&((i+1) as u64)) {
            Some(crop)=>{ // 有裁剪的页按像素矩形重新裁图并编码为 JPEG
                let decoded=image::open(&path).map_err(|e|e.to_string())?;
                let (x,y,w,h)=pixel_crop(decoded.width(),decoded.height(),*crop);
                let cropped=decoded.crop_imm(x,y,w,h);
                let mut buffer=Vec::new();
                cropped.write_to(&mut std::io::Cursor::new(&mut buffer),image::ImageFormat::Jpeg).map_err(|e|e.to_string())?;
                (buffer,cropped.width(),cropped.height())
            }
            None=>{let (width,height)=image::image_dimensions(&path).map_err(|e|e.to_string())?;(fs::read(&path).map_err(|e|e.to_string())?,width,height)}
        };
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

#[cfg(test)]
mod tests {
    use super::*;
    fn temporary_root()->PathBuf{PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.build/test-data").join(uuid::Uuid::new_v4().simple().to_string())}
    fn rectangle(values:[f64;4])->Vec<Object>{values.iter().map(|v|Object::Real(*v as f32)).collect()}
    // 构造一个简单 PDF：MediaBox、Rotate、CropBox 放在页对象上或祖先 Pages 节点上。
    fn build_document(pages:usize,rotate:i64,inherit:bool,media:[f64;4],existing:Option<[f64;4]>)->Document{
        let mut doc=Document::with_version("1.5");
        let pages_id=doc.new_object_id();
        let contents=doc.add_object(Stream::new(Dictionary::new(),Vec::new()));
        let mut page=Dictionary::new();
        page.set("Type","Page");page.set("Parent",pages_id);page.set("Contents",contents);page.set("Resources",Dictionary::new());
        if !inherit {page.set("MediaBox",rectangle(media));page.set("Rotate",rotate);if let Some(crop)=existing{page.set("CropBox",rectangle(crop));}}
        let mut kids=Vec::new();
        for _ in 0..pages {kids.push(Object::Reference(doc.add_object(page.clone())));}
        let mut parent=Dictionary::new();
        parent.set("Type","Pages");parent.set("Kids",kids);parent.set("Count",pages as i64);
        if inherit {parent.set("MediaBox",rectangle(media));parent.set("Rotate",rotate);if let Some(crop)=existing{parent.set("CropBox",rectangle(crop));}}
        doc.objects.insert(pages_id,Object::Dictionary(parent));
        let catalog=doc.add_object(dictionary!{"Type"=>"Catalog","Pages"=>pages_id});
        doc.trailer.set("Root",catalog);
        doc
    }
    fn numbers_of(dict:&Dictionary,key:&str)->Vec<f64>{dict.get(key.as_bytes()).map(|v|numbers(v).unwrap_or_default()).unwrap_or_default()}
    fn assert_close(actual:&[f64],expected:&[f64]){
        assert_eq!(actual.len(),expected.len(),"数字个数不正确：{actual:?}");
        for (a,e) in actual.iter().zip(expected){assert!((a-e).abs()<1e-3,"实际 {actual:?} 与预期 {expected:?} 不符");}
    }
    fn write_preview(path:&Path,width:u32,height:u32){image::RgbImage::from_pixel(width,height,image::Rgb([40,120,200])).save_with_format(path,image::ImageFormat::Jpeg).unwrap();}

    #[test]
    fn pixel_crop_clamps_to_image_bounds() {
        assert_eq!(pixel_crop(48,32,[0.0,0.0,0.5,0.5]),(0,0,24,16));
        assert_eq!(pixel_crop(48,32,[0.5,0.5,0.5,0.5]),(24,16,24,16));
        assert_eq!(pixel_crop(48,32,[0.99,0.99,0.5,0.5]),(47,31,1,1)); // 越界的起点收紧到最后一个像素并至少保留 1×1
        assert_eq!(pixel_crop(48,32,[0.0,0.0,0.001,0.001]),(0,0,1,1)); // 不足 1 像素时至少保留 1×1
    }

    #[test]
    fn crop_box_uses_inherited_page_attributes() {
        // MediaBox 与 Rotate 写在祖先 Pages 节点上时也要沿 Parent 链找到。
        let mut doc=build_document(1,90,true,[0.0,0.0,200.0,100.0],None);
        let page_id=*doc.get_pages().get(&1).unwrap();
        set_crop_box(&mut doc,page_id,[0.25,0.1,0.5,0.4]);
        assert_close(&numbers_of(doc.get_dictionary(page_id).unwrap(),"CropBox"),&[20.0,25.0,100.0,75.0]);
    }

    #[test]
    fn crop_mapping_skips_unsafe_pages() {
        let crop=[0.25,0.1,0.5,0.4];
        let cases=[
            ("MediaBox 原点不是 (0,0)",build_document(1,0,false,[10.0,20.0,210.0,120.0],None),None),
            ("Rotate 不是 0|90|180|270",build_document(1,45,false,[0.0,0.0,200.0,100.0],None),None),
            ("已有不兼容的 CropBox",build_document(1,0,false,[0.0,0.0,200.0,100.0],Some([5.0,5.0,100.0,60.0])),Some([5.0,5.0,100.0,60.0])),
            ("MediaBox 尺寸无效",build_document(1,0,false,[0.0,0.0,0.0,100.0],None),None),
        ];
        for (reason,mut doc,unchanged) in cases {
            let page_id=*doc.get_pages().get(&1).unwrap();
            set_crop_box(&mut doc,page_id,crop);
            let page=doc.get_dictionary(page_id).unwrap();
            match unchanged {
                Some(values)=>assert_close(&numbers_of(page,"CropBox"),&values), // 原有 CropBox 保持不变
                None=>assert!(page.get(b"CropBox").is_err(),"{reason} 时应跳过而不是设置 CropBox"),
            }
        }
        // 页面自带的整页 CropBox 与 MediaBox 一致，仍可安全覆盖。
        let mut doc=build_document(1,180,false,[0.0,0.0,200.0,100.0],Some([0.0,0.0,200.0,100.0]));
        let page_id=*doc.get_pages().get(&1).unwrap();
        set_crop_box(&mut doc,page_id,crop);
        assert_close(&numbers_of(doc.get_dictionary(page_id).unwrap(),"CropBox"),&[50.0,50.0,150.0,90.0]);
    }

    #[test]
    fn image_export_shrinks_cropped_pages_only() {
        let root=temporary_root();
        let library=Library::open(root.join("library")).unwrap();
        write_preview(&library.root.join("p1.jpg"),48,32);write_preview(&library.root.join("p2.jpg"),48,32);
        let material=json!({"id":"images","title":"图片课件","kind":"image","pages":2,"excluded":[],"crops":{"1":[0.0,0.0,0.5,0.5]},
            "files":[{"preview":"p1.jpg"},{"preview":"p2.jpg"}]});
        let output=root.join("out.pdf");
        export_images(&library,&material,&output).unwrap();
        let doc=Document::load(&output).unwrap();
        let pages=doc.get_pages();
        let first=doc.get_dictionary(*pages.get(&1).unwrap()).unwrap();
        let second=doc.get_dictionary(*pages.get(&2).unwrap()).unwrap();
        assert_close(&numbers_of(first,"MediaBox"),&[0.0,0.0,18.0,12.0]); // 48×32 裁成 24×16 像素后为 18×12 磅
        assert_close(&numbers_of(second,"MediaBox"),&[0.0,0.0,36.0,24.0]); // 没有裁剪的页保持原尺寸
        let resources=doc.get_dictionary(first.get(b"Resources").unwrap().as_reference().unwrap()).unwrap();
        let image_id=resources.get(b"XObject").unwrap().as_dict().unwrap().get(b"Im0").unwrap().as_reference().unwrap();
        let stream=doc.get_object(image_id).unwrap().as_stream().unwrap();
        assert_eq!(stream.dict.get(b"Width").unwrap().as_i64().unwrap(),24);
        assert_eq!(stream.dict.get(b"Height").unwrap().as_i64().unwrap(),16);
        assert_eq!(stream.dict.get(b"Filter").unwrap().as_name().unwrap(),b"DCTDecode".as_slice());
        drop(doc);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn pdf_export_maps_crops_to_crop_box_for_each_rotation() {
        let root=temporary_root();
        let library=Library::open(root.join("library")).unwrap();
        let cases=[(0i64,[50.0,50.0,150.0,90.0]),(90,[20.0,25.0,100.0,75.0]),(180,[50.0,50.0,150.0,90.0]),(270,[100.0,25.0,180.0,75.0])];
        for (rotate,expected) in cases {
            let name=format!("rotate-{rotate}.pdf");
            build_document(1,rotate,false,[0.0,0.0,200.0,100.0],None).save(library.root.join(&name)).unwrap();
            let material=json!({"id":format!("pdf-{rotate}"),"title":"旋转课件","kind":"pdf","pages":1,"excluded":[],"crops":{"1":[0.25,0.1,0.5,0.4]},"files":[{"original":name}]});
            let output=root.join(format!("out-{rotate}.pdf"));
            export_original_pdf(&library,&material,&output).unwrap();
            let doc=Document::load(&output).unwrap();
            let pages=doc.get_pages();
            let page=doc.get_dictionary(*pages.get(&1).unwrap()).unwrap();
            assert_close(&numbers_of(page,"CropBox"),&expected);
        }
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn export_respects_exclusions_and_crops() {
        let root=temporary_root();
        let library=Library::open(root.join("library")).unwrap();
        // PDF 类课件：排除第 2 页，第 1、3 页带裁剪
        build_document(3,0,false,[0.0,0.0,200.0,100.0],None).save(library.root.join("three.pdf")).unwrap();
        let material=json!({"id":"pdf-three","title":"三页 PDF","kind":"pdf","pages":3,"excluded":[2],"crops":{"1":[0.1,0.1,0.5,0.5],"3":[0.5,0.5,0.5,0.5]},"files":[{"original":"three.pdf"}]});
        let output=root.join("filtered.pdf");
        export_original_pdf(&library,&material,&output).unwrap();
        let doc=Document::load(&output).unwrap();
        let pages=doc.get_pages();
        assert_eq!(pages.len(),2);
        assert_close(&numbers_of(doc.get_dictionary(*pages.get(&1).unwrap()).unwrap(),"CropBox"),&[20.0,40.0,120.0,90.0]);
        assert_close(&numbers_of(doc.get_dictionary(*pages.get(&2).unwrap()).unwrap(),"CropBox"),&[100.0,0.0,200.0,50.0]);
        drop(doc);
        // 图片类课件：排除第 2 页，第 1 页带裁剪
        for i in 1..=3 {write_preview(&library.root.join(format!("i{i}.jpg")),48,32);}
        let images=json!({"id":"images","title":"图片课件","kind":"image","pages":3,"excluded":[2],"crops":{"1":[0.0,0.0,0.5,0.25]},
            "files":[{"preview":"i1.jpg"},{"preview":"i2.jpg"},{"preview":"i3.jpg"}]});
        let output=root.join("images.pdf");
        export_images(&library,&images,&output).unwrap();
        let doc=Document::load(&output).unwrap();
        let pages=doc.get_pages();
        assert_eq!(pages.len(),2);
        assert_close(&numbers_of(doc.get_dictionary(*pages.get(&1).unwrap()).unwrap(),"MediaBox"),&[0.0,0.0,18.0,6.0]);
        assert_close(&numbers_of(doc.get_dictionary(*pages.get(&2).unwrap()).unwrap(),"MediaBox"),&[0.0,0.0,36.0,24.0]);
        drop(doc);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn combined_export_keeps_exclusions_and_crops() {
        let root=temporary_root();
        let library=Library::open(root.join("library")).unwrap();
        build_document(2,0,false,[0.0,0.0,200.0,100.0],None).save(library.root.join("a.pdf")).unwrap();
        build_document(2,0,false,[0.0,0.0,200.0,100.0],None).save(library.root.join("b.pdf")).unwrap();
        let first=json!({"id":"a","title":"甲","day":"2024-01-01","kind":"pdf","pages":2,"excluded":[1],"crops":{"2":[0.5,0.5,0.5,0.5]},"files":[{"original":"a.pdf"}]});
        let second=json!({"id":"b","title":"乙","day":"2024-01-02","kind":"pdf","pages":2,"excluded":[],"crops":{},"files":[{"original":"b.pdf"}]});
        write_preview(&library.root.join("c1.jpg"),48,32);
        let third=json!({"id":"c","title":"丙","day":"2024-01-03","kind":"image","pages":1,"excluded":[],"crops":{"1":[0.0,0.0,0.5,0.5]},"files":[{"preview":"c1.jpg"}]});
        let output=root.join("combined.pdf");
        export_combined(&library,&[first,second,third],&output).unwrap();
        let doc=Document::load(&output).unwrap();
        let pages=doc.get_pages();
        assert_eq!(pages.len(),4); // 甲的 1 页 + 乙的 2 页 + 丙的 1 页
        assert_close(&numbers_of(doc.get_dictionary(*pages.get(&1).unwrap()).unwrap(),"CropBox"),&[100.0,0.0,200.0,50.0]); // 合并页 1 对应甲保留的原第 2 页
        assert!(doc.get_dictionary(*pages.get(&2).unwrap()).unwrap().get(b"CropBox").is_err());
        assert!(doc.get_dictionary(*pages.get(&3).unwrap()).unwrap().get(b"CropBox").is_err());
        assert_close(&numbers_of(doc.get_dictionary(*pages.get(&4).unwrap()).unwrap(),"MediaBox"),&[0.0,0.0,18.0,12.0]); // 图片类课件在临时导出里就已裁剪
        drop(doc);
        fs::remove_dir_all(&root).unwrap();
    }
}
