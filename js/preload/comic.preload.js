const send = require('../utils').send
const q = require('../utils').q

window.addEventListener('DOMContentLoaded', onload)

function onload() {

// TODO: There's a bug where sometimes all the images don't get loaded
// TODO: before this triggers, thus not building out the comic correctly
// TODO: I have been unable to replicate it recently, as much as I've tried
// TODO: The img.src is dynamically created on their site via jQuery, so sometimes
// TODO: the page is "loaded," but jQuery hasn't updated all the images yet
// TODO: Hopefully I figure this out.

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

  let recurse = false

  getImages()

  function getImages() {
    const images = q('img')
    let imgUrls = []

    images.forEach( (i, ind) => {
      if (i.src.includes('blank.gif')) {
        recurse = true
        return
      }
      if (i.src.includes('readcomiconline.to') || i.style.width === '100%') return
      imgUrls.push(i.src)
    })

    if (recurse) {
      recurse = false
      setTimeout(getImages, 1000)
    } else send({nav: nav, images: imgUrls})
  }
}