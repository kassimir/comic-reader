const utils = require('../utils')
const send = utils.send

window.addEventListener('DOMContentLoaded', onload)

function onload() {
  const searchResults = document.querySelector('.list-comic')
  if (!searchResults || !searchResults.innerHTML) {

    // If there's only one search result, it returns the actual comic
    // so instead of duplicating code from description.preload, I've decided
    // to just destroy the search and go with the description. It doesn't
    // seem to add much time to the render for me, but if it does cause
    // issues, I could see rewriting it.
    if (document.querySelector('#rightside img')) {
      send({link: window.location.href, cover: document.querySelector('#rightside img').src}, 'desc')
      return
    }

    if (document.querySelector('.barContent').innerText.trim() !== 'Not found') setTimeout(onload, 1000)
    else send('', 'nf')
    return
  }

  const comicList = Array.from(searchResults.children);
  comicList.forEach( (div, ind) => {
    const comic = {}

    comic.title = div.innerText;
    comic.link = getURI(div.innerHTML);
    comic.index = ind;

    send(comic)

    if (ind === comicList.length - 1) send('', 'end')

    function getURI(txt) {
      const startHref = txt.match('href=').index + 6;
      const endHref = txt.match('">\n').index;
      return 'http://readcomiconline.li' + txt.slice(startHref, endHref);
    }
  })
}
