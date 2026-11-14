import json, sqlite3, uuid
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[2]/'.build'/('workbench-qa-'+uuid.uuid4().hex[:8])
root.mkdir();(root/'exports').mkdir()
db=sqlite3.connect(root/'library.sqlite')
db.executescript('CREATE TABLE materials(id TEXT PRIMARY KEY,source_key TEXT UNIQUE,data TEXT NOT NULL);CREATE TABLE courses(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE tasks(id TEXT PRIMARY KEY,data TEXT NOT NULL);PRAGMA user_version=1;')
ids=[]
for index,size in enumerate([(800,600),(1200,675)]):
    mid=uuid.uuid4().hex;ids.append(mid);folder=root/'materials'/mid;folder.mkdir(parents=True)
    records=[]
    for page in range(1,5):
        image=Image.new('RGB',size,'white');draw=ImageDraw.Draw(image)
        draw.rectangle((0,0,size[0],80),fill=['#2356bc','#7256b8'][index]);draw.text((40,120),f'QA document {index+1} page {page}',fill='black',font_size=32)
        draw.rectangle((80,200,size[0]-80,size[1]-80),fill=['#e6f0ff','#efe6ff'][index],outline='black',width=3)
        original=folder/f'{page:05}.jpg';image.save(original)
        thumb=folder/f'{page:05}-thumb.jpg';image.thumbnail((480,360));image.save(thumb)
        records.append({'original':str(original.relative_to(root)).replace('\\','/'),'preview':str(original.relative_to(root)).replace('\\','/'),'thumb':str(thumb.relative_to(root)).replace('\\','/')})
    material={'id':mid,'title':f'Integration QA {index+1}','topic':'','day':'2026-11-14','pages':4,'files':records,'sourceKey':'local:'+mid,'source':'import','kind':'image','courseId':'qa-course','excluded':[],'crops':{},'edited':False,'exported':False,'revision':0,'reviewRevision':None,'exportRevision':None,'lastPage':1,'deleted':False,'touched':index}
    db.execute('INSERT INTO materials VALUES(?,?,?)',(mid,material['sourceKey'],json.dumps(material)))
db.execute('INSERT INTO courses VALUES(?,?)',('qa-course',json.dumps({'id':'qa-course','title':'业务接入检查','term':'测试资料'})))
db.execute('INSERT INTO settings VALUES(?,?)',('settings',json.dumps({'exportMode':'review','exportDir':str(root/'exports'),'maxWorkers':2})))
db.commit();db.close()
(root/'fixture.json').write_text(json.dumps({'root':str(root),'ids':ids}),encoding='utf-8')
print(root)
