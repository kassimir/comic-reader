const send = require('../utils').send

window.onload = onload

function onload() {
  const searchResults = document.querySelectorAll('.listing tbody')[0]

  if (!searchResults || !searchResults.innerHTML) {
    setTimeout(onload, 1000)
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