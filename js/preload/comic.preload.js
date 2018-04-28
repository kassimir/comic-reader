const send = require('../utils').send
const q = require('../utils').q

window.onload = onload

function onload() {
  const comicsDiv = q('#divImage')
  const issueSelect = document.querySelector('select.selectEpisode')
  const prev = document.querySelector('.btnPrevious')
  const next = document.querySelector('.btnNext')
  const selectedIndex = issueSelect.selectedIndex

  if (!comicsDiv
    || !comicsDiv.innerHTML
    || !issueSelect.children
  ) {
    setTimeout(onload, 2000)
    return
  }

  const images = q('img')
  let selectedIssue
  const issueList = Array.from(issueSelect.children).map( (o,i) => {
    if (i === selectedIndex) selectedIssue = o.textContent.trim()
    return {txt: o.textContent.trim(), val: o.value}
  })
  const prevLink = prev ? prev.parentElement.href : ''
  const nextLink = next ? next.parentElement.href : ''

  const nav = {
    issues: issueList,
    prev: prevLink,
    next: nextLink,
    selectedIssue: selectedIssue
  }

  let imgUrls = []

  getImages()

  function getImages() {
    images.forEach( i => {
      imgUrls.push(i.src)
    })
    send({nav: nav, images: imgUrls})
  }
}