const Tile = require('./js/models/tile.model')
const utils = require('./js/utils.js')
const qi = utils.qi
const q = utils.q
const create = utils.create
const getIssue = utils.getOrRemoveIssue
const sortIssues = utils.sortIssues
const writeRecent = utils.writeRecent

// Hidden div for rendering pages in the background
const hidden = qi('hidden')
// Reader div for actually displaying data
const reader = qi('reader')
// This is the object from which the main page will be built
const frontPage = {
  latest: {},
  newest: {},
  topday: {},
  topweek: {},
  topmonth: {},
  mostpopular: {}
}

const currentComic = {
  title: '',
  cover: '',
  link: ''
}

// This is the database for Most Recently Read
const recentDB = require('./database/recent.database')

let descNode, issueNode, iframeTO, loaded = false

// This is here, because the main page has a bunch of iframes on it that will
// block my code from running. This script here will force code into the page
// and destroy all the iframes and allow my code to work.
function loadCommit() {
  if (iframeTO) return
  iframeTO = setInterval(() => {
    if (!loaded && q('webview')) {
      q('webview').executeJavaScript(`document.querySelectorAll('iframe').forEach(f => f.parentElement.removeChild(f))`)
      const modal = document.querySelector('div[id*="close"]')
      if (modal && modal.innerHTML) modal.click()
    } else clearInterval(iframeTO)}, 2000)
}

qi('debug').addEventListener('click', () => {
  hidden.style.visibility = 'visible'
  q('html').style.height = '100%'
  q('body').style.height = '100%'
  q('webview').style.height = '100%'
  hidden.style.height = '100%'
  reader.style.display = 'none'
})

qi('opendev').addEventListener('click', () => {
  q('webview').openDevTools()
})

function search(){
  const keyword = q('#search-input').value.replace(' ', '+')

  function ipcMessage(e) {
    if (e.channel === 'end') clearHidden()

    const comic = e.args[0]

    if (!comic.link || !comic.title || !comic.issues) return

    const searchDiv = q('#search-results')

    const resultDiv = create('div', {class: 'search-table'})
    const icon = create('span', {class: ['fas', 'fa-info-circle']}, {'click': () => navigation('description', {section: 'search', link: comic.link})})
    const titleSpan = create('span', {textContent: comic.title, style: {marginLeft: '10px'}}, {'click': () => navigation('description', {section: 'search', link: comic.link, view: 'issue'})})
    const titleDiv = create('div')
    const issueSpan = create('span', {textContent: comic.issues}, {'click': () => navigation('description', {section: 'search', link: comic.link, view: 'issue'})})

    titleDiv.appendChild(icon)
    titleDiv.appendChild(titleSpan)
    resultDiv.appendChild(titleDiv)
    resultDiv.appendChild(issueSpan)
    searchDiv.appendChild(resultDiv)
  }

  bgRender(`http://readcomiconline.to/Search/Comic?keyword=${keyword}`, 'js/preload/search.preload.js', {'ipc-message': ipcMessage})
}
// STEP ONE:
// Navigate to the site, then steal its front page
function mainRender() {

  function ipcMessage(e) {
    switch(e.channel) {
      case 'msg': console.log(e.args[0]); break
      case 'tab-newest': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-top-day': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-top-week': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-top-month': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-mostview': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'latest': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'end': clearHidden(); break
      default: console.log(e);
    }
  }

  bgRender('http://readcomiconline.to', 'js/preload/tops.preload.js', {'ipc-message': ipcMessage})
  if (Object.keys(recentDB).length) {
    // sort recently read
    const sortedRecent = Object.keys(recentDB).sort( (a, b) => {
      return new Date(recentDB[b].date) - new Date(recentDB[a].date)
    })
    sortedRecent.forEach( c => {
      const comic = recentDB[c]
      buildTile(new Tile(c, comic.cover, comic.link), 'recent')
    })
  }
}

window.onload = mainRender

function buildTile(tile, section) {
  const sect = section.replace(/(tab|-)/g,'')
  const comicDiv = qi(`${sect}`).querySelector('.carousel-inner')

  const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}}, {'click': onclick})
  const img = create('img', {'data-link': tile.link, 'data-section': sect, class: 'link', src: tile.img, style: {width: '20vw', margin: '0 2.25vw'}})
  const title = create('span', {'data-link': tile.link, 'data-section': sect, class: 'link', innerText: tile.title, style: {color: 'white', margin: '7px'}})
  if (section === 'recent') container.id = tile.title.replace(/[\s()]/g, '')

  container.appendChild(img)
  container.appendChild(title)
  comicDiv.appendChild(container)

  function onclick() {
      navigation('description', {link: tile.link, section: section})
  }
}

//
// function buildTiles() {
//
//   // Destroy the hidden webview
//   clearHidden()
//   // Most Recently Read is built differently
//   if (Object.keys(recentDB).length) {
//     frontPage['recent'] = {}
//     for (let comic in recentDB) {
//       frontPage.recent[comic] = new Tile(recentDB[comic].cover, recentDB[comic].link)
//     }
//   }
//
//   for (let section in frontPage) {
//     function loadSearch(e) {
//       if (e.target.nodeName === 'IMG') {
//         currentComic.cover = e.target.src
//         currentComic.link = e.target.dataset.link
//         currentComic.title = e.target.parentElement.children[1].textContent
//       } else {
//         currentComic.cover = e.target.parentElement.children[0].src
//         currentComic.link = e.target.dataset.link
//         currentComic.title = e.target.textContent
//       }
//       navigation('description', {link: e.target.dataset.link, section: e.target.dataset.section})
//     }
//
//     // TODO: Make a way to display issues instead of description - currently defaults to always showing description first
//     // change to just setting width
//     const div = create('div', {class: 'carousel-inner', style: {width: Object.keys(frontPage[section]).length * 20 + '%'}}, {'click': loadSearch})
//
//     for (let item in frontPage[section]) {
//       const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}})
//       const img = create('img', {'data-link': frontPage[section][item].link, 'data-section': section, class: 'link', src: frontPage[section][item].img, style: {width: '20vw', margin: '0 2.25vw'}})
//       const title = create('span', {'data-link': frontPage[section][item].link, 'data-section': section, class: 'link', innerText: item, style: {color: 'white', margin: '7px'}})
//       if (section === 'recent') container.id = item.replace(/[\s()]/g, '')
//       container.appendChild(img)
//       container.appendChild(title)
//       div.appendChild(container)
//
//       if (section !== 'recent' || !carousel.children.length) {
//         carousel.appendChild(div)
//       } else {
//         // I'm not sure if this is the best way to go about this, but it sorts via date
//         // so recent items show up in the order in which they were read (most recent first)
//         // I could probably do a sort like what I do with the issues, but this code works for now
//         const read = carousel.querySelectorAll('div')
//         const thisBookDate = new Date(recentDB[item].date)
//         let prepend
//         let prependDate = new Date(new Date().getDate() - 100)
//
//         read.forEach( title => {
//           const readTitle = title.querySelector('span').textContent
//           const readDate = new Date(recentDB[readTitle].date)
//           if (!prependDate) prependDate = readDate
//           if (thisBookDate > readDate && readDate > prependDate) {
//             prepend = readTitle
//             prependDate = recentDB[readTitle].date
//           }
//         })
//
//         if (prepend) {
//           const prependDiv = q(`#${prepend.replace(/[\s()]/g, '')}`)
//           div.insertBefore(container, prependDiv)
//         } else {
//           carousel.appendChild(div)
//         }
//       }
//     }
//   }
//
//   // Empty div for showing search results
//   const searchResults = create('div', {id: 'search-results', style: {width: '100%', marginTop: '20px'}})
//   const searchDesc = create('div', {id: 'search-desc', style: {width: '100%', marginTop: '20px'}})
//   reader.insertBefore(searchDesc, reader.childNodes[0])
//   reader.insertBefore(searchResults, reader.childNodes[0])
//
// }

// This is the function to "navigate" between pages
// in the render div
function navigation(page, e) {
  //TODO: This function is pretty huge. Make it smaller.

  // Shows the descriptiong of the selected comic
  if (page === 'description') {
    const descId = `${e.section}-desc`
    const comicLink = e.link;
    let desc, comicTitle
    let view = 'desc'
    let loadIssue = e.view === 'issue'
    const issueFragment = document.createDocumentFragment()
    const descFragment = document.createDocumentFragment()

    function ipcMessage(e) {
      if (e.channel === 'msg') {
        console.log(e.args[0])
        return
      }
      clearHidden()

      desc = qi(descId)
      const descArgs = e.args[0].desc
      comicTitle = descArgs.title
      // I contemplated just writing everything with .innerHTML, simply because
      // there are so many elements being made, but after a lot of research, it
      // is supposed to be faster this way, so I chose it. I may update these to
      // not have inline styles. But it's hard not to utilize the amazing functionality
      // of my create function. :P

      // titleHeader is the title header. It contains the title of the comic,
      // the "Go to Comic" and "Add to Reading List", and the close button
      const titleHeader = create('div', {class: 'desc-title'})
      const title = create('p', {textContent: descArgs.title, style: {width: '34%'}})
      const optionsContainer = create('div', {'style': {display: 'flex', flexDirection: 'row', width: '33%'}, class: 'section-desc_options'})
      const descReadIcon = create('span', {class: ['fas', 'fa-list'], id: 'desc-read-icon'})
      const listIssues = create('span', {id: 'desc-issue-toggle', class: 'link', textContent: 'Show Issues'}, {'click': () => toggleView()})
      const addIcon = create('span', {class: ['fas', 'fa-plus']})
      const addToReadingList = create('span', {class: 'link', textContent: 'Add To Reading List'})
      const closeDescription = create('div', {style: {textAlign: 'right', width: '33%'}}, {'click': () => desc.innerHTML = ''})
      const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '20px'}})

      optionsContainer.appendChild(addIcon)
      optionsContainer.appendChild(addToReadingList)
      optionsContainer.appendChild(descReadIcon)
      optionsContainer.appendChild(listIssues)
      closeDescription.appendChild(closeDesc)
      titleHeader.appendChild(optionsContainer)
      titleHeader.appendChild(title)
      titleHeader.appendChild(closeDescription)

      // Description
      const descContainer = create('div', {class: 'desc-info'})
      const info = create('div', {style: {width: '35%', display: 'flex', flexDirection: 'column'}})
      const genre = create('p', {textContent: `${descArgs.genres.length > 1 ? 'Genres' : 'Genre'}: ${descArgs.genres.join(', ')}`, fontWeight: 'bold'})
      const writer = create('p', {textContent: `${descArgs.writer.length > 1 ? 'Writers' : 'Writer'}: ${descArgs.writer.join(', ')}`, fontWeight: 'bold'})
      const artist = create('p', {textContent: `${descArgs.artist.length > 1 ? 'Artists' : 'Artist'}: ${descArgs.artist.join(', ')}`, fontWeight: 'bold'})
      const publisher = create('p', {textContent: `${descArgs.publisher.length > 1 ? 'Publishers' : 'Publisher'}: ${descArgs.publisher.join(', ')}`, fontWeight: 'bold'})
      const publicationdate = create('p', {textContent: `Publication Date: ${descArgs.publicationdate}`})

      info.appendChild(genre)
      info.appendChild(writer)
      info.appendChild(artist)
      info.appendChild(publisher)
      info.appendChild(publicationdate)

      descContainer.appendChild(info)
      descFragment.appendChild(descContainer)

      const summary = create('div', {style: {width: '60%', display: 'flex', flexDirection: 'column'}})
      const summaryTitle = create('p', {textContent: 'Summary:'})
      const summarySummary = create('p', {textContent: descArgs.summary})

      summary.appendChild(summaryTitle)
      summary.appendChild(summarySummary)
      descContainer.appendChild(summary)

      descNode = descFragment.cloneNode(true)

      if (desc.children.length) desc.innerHTML = ''

      desc.appendChild(titleHeader)
      desc.appendChild(descFragment)

      // Build issues
      const ishArgs = e.args[0].issues
      const issueContainer = create('div', {class: 'issue-container'})

      const sortedIssuesArray = sortIssues(Object.keys(ishArgs))

      sortedIssuesArray.forEach( i => {
        let spanClass = 'link'
        if (recentDB[comicTitle] && recentDB[comicTitle].issues[getIssue(i, 'issue')]) spanClass = 'link-read'
        const a = create('span', {textContent: i, 'data-link': ishArgs[i], class: spanClass})
        issueContainer.appendChild(a)
      })

      issueFragment.appendChild(issueContainer)
      issueNode = issueFragment.cloneNode(true)

      // This is a temporary, hacky way to load issues instead of description
      if (loadIssue) toggleView()
    }

    function toggleView() {
      if (view === 'desc') {
        qi('desc-read-icon').classList.remove('fa-list')
        qi('desc-read-icon').classList.add('fa-book')
        qi('desc-issue-toggle').textContent = 'Show Description'
        let temp = issueNode.cloneNode(true)
        desc.removeChild(desc.querySelector('.desc-info'))
        desc.appendChild(issueNode)
        if (q('.issue-container span').length) {
          q('.issue-container span').forEach( i => i.addEventListener('click', e => {
            navigation('comic', {title: comicTitle, issue: e.target.textContent, link: e.target.dataset.link})
          }))
        } else {
          q('.issue-container span').addEventListener('click', e => {
            navigation('comic', {title: comicTitle, issue: e.target.textContent, link: e.target.dataset.link})
          })
        }
        issueNode = temp.cloneNode(true)
        view = 'issue'
        if (loadIssue) loadIssue = null
      } else {
        qi('desc-read-icon').classList.remove('fa-book')
        qi('desc-read-icon').classList.add('fa-list')
        qi('desc-issue-toggle').textContent = 'Show Issues'
        let temp = descNode.cloneNode(true)
        if (!loadIssue) desc.removeChild(desc.querySelector('.issue-container'))
        desc.appendChild(descNode)
        descNode = temp.cloneNode(true)
        view = 'desc'
      }
    }

    bgRender(comicLink, './js/preload/description.preload.js', {'ipc-message': ipcMessage})
  } else if (page === 'comic') {
    // Save to Recently Read database
    writeRecent(currentComic, e.issue, e.link)
    // Set up Home button
    qi('home').addEventListener('click', mainRender)
    qi('home').style.cursor = 'pointer'

    function ipcMessage(e) {
      clearHidden()
      reader.innerHTML = ''
      const div = create('div', {style: {width: '100%', display: 'flex', justifyContent: 'center', flexDirection: 'column'}})
      reader.appendChild(div)
      e.args[0].forEach( i => {
        const img = create('img', {src: i})
        div.appendChild(img)
      })
    }

    bgRender(e.link, './js/preload/comic.preload.js', {'ipc-message': ipcMessage})
  }
}

function bgRender(src, preload, listeners) {
  loaded = false
  if (!listeners['load-commit']) listeners['load-commit'] = loadCommit
  const backgroundWebview = create('webview', {src: src, preload: preload}, listeners)
  hidden.appendChild(backgroundWebview)
}

// I kept forgetting to do this, so I just made a function for it
// that is easy to remember after every time I create a hidden webview
function clearHidden() {
  loaded = true
  clearInterval(iframeTO)
  iframeTO = null
  if (hidden.childNodes.length) {hidden.removeChild(q('webview'))}
}