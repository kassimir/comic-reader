const send = require('../utils').send

window.addEventListener('DOMContentLoaded', onload)

function onload() {
  const searchResults = document.querySelectorAll('.listing tbody')[0]
  if (!searchResults || !searchResults.innerHTML) {
    if (document.querySelector('.barContent').innerText.trim() !== 'Not found') setTimeout(onload, 1000)
    else send('', 'nf')
    return
  }

  // If there's only one search result, it returns the actual comic
  // so instead of duplicating code from description.preload, I've decided
  // to just destroy the search and go with the description. It doesn't
  // seem to add much time to the render for me, but if it does cause
  // issues, I could see rewriting it.
   if (document.querySelector('#rightside img')) {
    send({link: window.location.href, cover: document.querySelector('#rightside img').src}, 'desc')
    return
  }

  const tableColumns = searchResults.querySelectorAll('tr')

  tableColumns.forEach( (t, ind) => {
    if (ind < 2) return

    const comic = {}

    if (t.children.length === 2) {
      if (t.children[0].children.length) {
        comic.link = t.children[0].children[0].href
        comic.title = t.children[0].children[0].textContent.trim()
      }
      if (t.children[1].children.length) {
        comic.issues = t.children[1].children[0].textContent.trim()
      } else {
        comic.issues = t.children[1].textContent.trim()
      }
    }
    send(comic)
    if (ind === tableColumns.length - 1) send('', 'end')
  })
}