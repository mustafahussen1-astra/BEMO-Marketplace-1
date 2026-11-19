(() => {
 const keys=['logo','cover'],urls=new Map();
 const field=(key,suffix)=>document.getElementById(key+suffix);
 function revoke(key){if(urls.has(key))URL.revokeObjectURL(urls.get(key));urls.delete(key);}
 for(const key of keys){
  field(key,'File').addEventListener('input',()=>{
   revoke(key);
   const file=field(key,'File').files[0];
   if(file){urls.set(key,URL.createObjectURL(file));field(key,'Remove').checked=false;}
  });
  field(key,'Remove').addEventListener('input',()=>{revoke(key);field(key,'File').value='';});
 }
 function source(key,saved){
  if(field(key,'Remove').checked)return '';
  const path=saved?.[key+'_path'];
  return urls.get(key)||(path?window.BEMO_BACKEND.url+'/storage/v1/object/public/bemo-store-images/'+path:'');
 }
 window.BemoBrand={
  reset(){for(const key of keys){revoke(key);field(key,'File').value='';field(key,'Remove').checked=false;}document.querySelector('.store-hero').style.backgroundImage='';document.getElementById('storeMark').replaceChildren();},
  preview(saved){
   const logo=source('logo',saved),cover=source('cover',saved);
   if(logo){const img=document.createElement('img');img.src=logo;img.alt='';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit';document.getElementById('storeMark').replaceChildren(img);}
   const hero=document.querySelector('.store-hero');hero.style.backgroundImage=cover?'linear-gradient(90deg,#10203cdd,#10203c77),url("'+cover+'")':'';hero.style.backgroundSize='cover';hero.style.backgroundPosition='center';
  },
  async upload(){const images={};await Promise.all(keys.map(async key=>{const file=field(key,'File').files[0];if(field(key,'Remove').checked)images[key]=null;else if(file)images[key]=await window.BemoAccount.uploadStoreImage(file);}));return images;}
 };
})();
