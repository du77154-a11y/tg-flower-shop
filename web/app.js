const tg=window.Telegram?.WebApp; if(tg){tg.ready();tg.expand();tg.MainButton?.hide();}
let products=[],currentProduct=null;
const modalBackdrop=document.getElementById('modalBackdrop');
const modalImg=document.getElementById('modalImg');
const modalTitle=document.getElementById('modalTitle');
const modalPrice=document.getElementById('modalPrice');
const modalDesc=document.getElementById('modalDesc');
const modalClose=document.getElementById('modalClose');
const modalOrder=document.getElementById('modalOrder');

async function loadProducts(){
  try{ const res=await fetch('/products',{cache:'no-store'}); products=await res.json(); render();}
  catch(e){ console.error(e); document.getElementById('root').innerHTML='<div class="empty">Не удалось загрузить товары</div>'; }
}
function render(){
  const root=document.getElementById('root');
  if(!products.length){ root.innerHTML='<div class="empty">Нет товаров</div>'; return; }
  root.innerHTML=products.map(p=>`
    <div class="card">
      <img src="${p.image}" alt="${p.title}" loading="lazy"/>
      <div class="title">${p.title}</div>
      <div class="price">${p.price} ₽</div>
      <div class="desc">${truncate(p.description||'',80)}</div>
      <div class="actions">
        <button class="btn-secondary" data-action="more" data-id="${p.id}">Подробнее</button>
        <button data-action="order" data-id="${p.id}">Заказать</button>
      </div>
    </div>`).join('');
  root.querySelectorAll('button[data-action="more"]').forEach(btn=>btn.onclick=()=>openModal(btn.getAttribute('data-id')));
  root.querySelectorAll('button[data-action="order"]').forEach(btn=>btn.onclick=()=>order(btn.getAttribute('data-id')));
}
function truncate(t,l){ return t.length>l? t.slice(0,l-1)+'…':t; }
function openModal(id){
  const p=products.find(x=>x.id===id); if(!p) return; currentProduct=p;
  modalImg.src=p.image; modalImg.alt=p.title; modalTitle.textContent=p.title;
  modalPrice.textContent=p.price+' ₽'; modalDesc.textContent=p.description||'';
  modalBackdrop.classList.add('modal-show');
}
function closeModal(){ modalBackdrop.classList.remove('modal-show'); currentProduct=null; }
function order(id){
  const p=products.find(x=>x.id===id)||currentProduct; if(!p) return;
  if(tg?.sendData){ tg.sendData(JSON.stringify({action:'order',product:p})); tg.close();}
  else{ alert('Заявка на букет:\n'+JSON.stringify({title:p.title,price:p.price},null,2)); }
}
modalClose?.addEventListener('click',closeModal);
modalBackdrop?.addEventListener('click',e=>{ if(e.target===modalBackdrop) closeModal(); });
modalOrder?.addEventListener('click',()=>order(currentProduct?.id));
loadProducts();