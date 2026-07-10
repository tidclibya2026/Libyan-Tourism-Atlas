const enter = document.querySelector('.landing__enter');
const status = document.getElementById('launchStatus');

function openAtlas(event){
  if(event) event.preventDefault();
  status.style.display = 'flex';
  window.setTimeout(() => {
    window.location.href = 'atlas.html';
  }, 260);
}

enter.addEventListener('click', openAtlas);

document.addEventListener('keydown', (event) => {
  if(event.key === 'Enter') openAtlas(event);
});
