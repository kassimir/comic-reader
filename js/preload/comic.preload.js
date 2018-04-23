const send = require('../utils').send

window.onload = onload

function onload() {
  const comicsDiv = document.querySelector('#divImage')

  if (!comicsDiv || !comicsDiv.innerHTML) setTimeout(onload, 2000)

  const images = comicsDiv.querySelectorAll('img')

  let imgUrls = []

  getImages()

  function getImages() {
    images.forEach( i => {
      imgUrls.push(i.src)
    })
    send(imgUrls)
  }
}