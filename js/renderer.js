const utils = require('./js/utils')
const api = require('./js/api')
const {
  qi,
  q,
  qc,
  create,
  getOrRemoveIssue: getIssue,
  sortIssues,
  appendChildren,
  compareDBs
} = utils
const {
  getDB,
  readDB,
  writeToDB,
  rewriteDB,
  updateDB,
  deleteFromDB,
  createGroup,
  deleteGroupDB,
  createIssueList,
  addIssuesToListDB,
  moveListIssues,
  deleteListIssue,
  deleteListFromDB,
  writeRecent,
  downloadComic,
  getDBsCloud
} = api
const TILE = require('./js/models/tile.model')
const COMIC = require('./js/models/comic.model')
const fs = require('fs')
const ipc = require('electron').ipcRenderer
const clipboard = require('electron').clipboard

// Hidden div for rendering pages in the background
const hidden = qi('hidden')
// Reader div for actually displaying data
const reader = qi('reader')
// Variable for the loader failsafe (failLoad)
let loaderLoading, loaderTimeout
// Cloud dbs
let cloudDBs

// Get databases from cloud
getDBsCloud()

ipc.on('dbcloud', (e, a) => cloudDBs = JSON.parse(a))

// This is the object from which the main page will be built
const frontPage = {
  latest: {},
  newest: {},
  topday: {},
  topweek: {},
  topmonth: {},
  mostpopular: {}
}

const currentComic = new COMIC()

let comicTitle

// After creating groups, it was going to become very expensive to
// check every issue for being in a group, so I'm creating an array
// of issue titles instead and a correlating list of what group it's in.
let GROUPS = getDB('groups', {type: 'arr'}), GROUP_ISSUE_ARRAY = []
// Same thing but for Lists
let LISTS = getDB('lists', {type: 'arr'})

// INSERTING SMALL PATCH FOR BACKWARDS COMPATIBILITY
// DBs used to have a date property, but it's been removed
// in favor of a position property. This checks to see if
// the database has been updated to the current way of
// reading/sorting database items, then fixes them, if needed
let recentDB, readingDB

// This is the database for the Reading List
if (fs.existsSync('./database/reading.database.json')) {
  readingDB = getDB('reading', {createNew: false})
  // This is the backwards compatibility part.
  // If there are some without
  const dates = Object.keys(readingDB).some( o => readingDB[o].date)
  if (dates) {
    readingDB = updateDBOld(readingDB)
    rewriteDB('reading', readingDB)
  }
} else {
  if (!fs.existsSync('./database')) fs.mkdirSync('./database')
  fs.writeFileSync('./database/reading.database.json', '{}', {flag: 'w'})
  readingDB = {}
}

if (!navigator.onLine) {
  // Go to download mode
  q('.section-title').forEach(i => i.style.display = 'none')
  q('.carousel-outer').forEach(i => i.style.display = 'none')
  q('.downloaded').forEach(i => i.style.display = 'flex')
  const downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  Object.keys(downloadedDB).forEach(key => {
    buildTile(new TILE(key, `downloads/${key}/cover.jpg`, null), `downloaded`)
  })
} else {
  loader('start', true)
  window.onload = mainRender
}

// This is the database for Most Recently Read
if (fs.existsSync('./database/recent.database.json')) recentDB = JSON.parse(fs.readFileSync('./database/recent.database.json').toString())
else {
  if (!fs.existsSync('./database')) fs.mkdirSync('./database')
  fs.writeFileSync('./database/recent.database.json', '{}', {flag: 'w'})
  recentDB = {}
}

function updateDBOld(db) {
  const sorted = Object.keys(db).sort((a, b) => {
    if (!db[b].date || !db[a].date) return -1
    return new Date(db[b].date) - new Date(db[a].date)
  })

  const newDB = {}
  let c = sorted.length

  sorted.forEach( t => {
    const comic = new Object(db[t])
    delete comic.date
    comic.position = c
    c--
    newDB[t] = comic
  })

  return newDB
}


let iframeTO, loaded = false

// This is for the previous and next button once the comic is loaded
// I may not need them to be global, but that's where I'm putting them
let previousIssue, nextIssue

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
    } else clearInterval(iframeTO)
  }, 2000)
}

function search() {
  // ipc.send('close')
  // return
  loader('start', false)

  scrollSection('search')
  const keyword = q('#search-input').value.replace(' ', '+')

  if (q('#search-results').innerHTML) q('#search-results').innerHTML = ''
  const closeSearchDiv = create('div', {
    style: {
      textAlign: 'right',
      paddingRight: '20px',
      backgroundColor: '#5E051D',
      visibility: 'hidden'
    }
  })
  const closeSeachButton = create('span', {class: 'link', textContent: 'X'}, {
    'click': () => {
      q('#search-results').innerHTML = ''
      q('#search-desc').innerHTML = ''
    }
  })
  closeSearchDiv.appendChild(closeSeachButton)
  q('#search-results').appendChild(closeSearchDiv)

  function ipcMessage(e) {
    if (e.channel === 'end') {
      closeSearchDiv.style.visibility = 'visible'
      clearHidden()
      return
    } else if (e.channel === 'msg') {
      console.log(e.args[0])
      return
    } else if (e.channel === 'desc') {
      clearHidden()
      qi('search-results').innerHTML = ''
      navigation('description', {link: e.args[0].link, cover: e.args[0].cover, section: 'search', view: 'd'})
      return
    } else if (e.channel === 'nf') {
      console.log(e.args[0])
      clearHidden()
      navigation('description', {section: 'search', nf: true})
    }
    const comic = e.args[0]

    if (!comic.link || !comic.title || !comic.issues) return

    const searchDiv = q('#search-results')

    const resultDiv = create('div', {class: 'search-table'})
    const icon = create('span', {class: ['fas', 'fa-info-circle']}, {
      'click': () => navigation('description', {
        section: 'search',
        link: comic.link,
        view: 'd'
      })
    })
    const titleSpan = create('span', {
      textContent: comic.title,
      style: {marginLeft: '10px'}
    }, {'click': () => navigation('description', {section: 'search', link: comic.link, view: 'i'})})
    const titleDiv = create('div')
    const issueSpan = create('span', {textContent: comic.issues}, {
      'click': () => navigation('description', {
        section: 'search',
        link: comic.link,
        view: 'i'
      })
    })

    appendChildren(titleDiv, icon, titleSpan)
    appendChildren(resultDiv, titleDiv, issueSpan)
    searchDiv.appendChild(resultDiv)
  }

  bgRender(`http://readcomiconline.to/Search/Comic?keyword=${keyword}`, 'js/preload/search.preload.js', {'ipc-message': ipcMessage})
}

// STEP ONE:
// Navigate to the site, then steal its front page
/*
/////////// Trying to save reading progress
const currentScroll = reader.scrollTop
  const sectionScroll = section === 'search' ? 0 : section.offsetTop - 65

  if (sectionScroll <= currentScroll - 5) {
    reader.scrollTop -= 3
    setTimeout(scrollSection, 0, section)
  } else if (sectionScroll >= currentScroll + 5) {
    reader.scrollTop += 3
    setTimeout(scrollSection, 0, section)
  } else if (sectionScroll < currentScroll || sectionScroll > currentScroll) {
    reader.scrollTop = sectionScroll
  }
 */
function mainRender() {
  // Wait for the databases to come back from the cloud
  if (!cloudDBs) return setTimeout(mainRender, 1000)
  // Get local reading and recent
  readingDB = getDB('reading', {createNew: false})
  recentDB = getDB('recent', {createNew: false})

  // Compare Reading
  if (!compareDBs(cloudDBs.reading, readingDB)) {
    // rewriteDB('reading', cloudDBs.reading)
    // readingDB = Object.assign({}, cloudDBs.reading)
  }
  // Compare Recent
  if (!compareDBs(cloudDBs.recent, recentDB)) {
    // rewriteDB('recent', cloudDBs.recent)
    // recentDB = Object.assign({}, cloudDBs.recent)
  }
  // Check all groups
  if (cloudDBs.groups && cloudDBs.groups.length) {

  } else if (getDB('groups').length) {
    Object.keys(getDB('groups')).forEach( g => {
      deleteGroupDB(g)
    })
  }

  // return
  // Hide the Home and download button, if it is showing
  if (qi('home-download').style.visibility === 'visible') rebuild()
  if (qi('lists').style.display === 'none') qi('lists').style.display = 'block'
  if (qi('title-buttons').style.visibility === 'hidden') qi('title-buttons').style.visibility = 'visible'

  function ipcMessage(e) {
    switch (e.channel) {
      case 'msg':
        console.log(e.args[0]);
        break
      case 'tab-newest':
        buildTile(new TILE(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-day':
        buildTile(new TILE(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-week':
        buildTile(new TILE(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-month':
        buildTile(new TILE(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-mostview':
        buildTile(new TILE(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'latest':
        buildTile(new TILE(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'end':
        clearHidden();
        break
      default:
        break;
    }
  }

  bgRender('http://readcomiconline.to', 'js/preload/tops.preload.js', {'ipc-message': ipcMessage})

  // Recently Read
  if (Object.keys(recentDB).length) {
    qi('recent').style.display = 'block'
    // Sort by position number
    const sortedRecent = Object.keys(recentDB).sort((a, b) => {
      return new Date(recentDB[b].position) - new Date(recentDB[a].position)
    })

    sortedRecent.forEach( c => {
      const comic = new Object(recentDB[c])
      buildTile(new TILE(c, comic.cover, comic.link), 'recent')
    })
  } else qi('recent-text').style.display = 'none'

  // Reading List
  if (Object.keys(readingDB).length) {
    qi('reading-text').style.display = 'flex'
    qi('reading').style.display = 'flex'
    const sortedReading = Object.keys(readingDB).sort((a, b) => {
      return readingDB[b].position - readingDB[a].position
    })

    sortedReading.forEach( c => {
      const comic = readingDB[c]
      GROUP_ISSUE_ARRAY.push({title: c, db: 'reading'})
      buildTile(new TILE(c, comic.cover, comic.link), 'reading', null, comic.position)
    })
  } else {
    qi('reading').style.display = 'none'
    qi('reading-text').style.display = 'none'
  }

  // Build Groups
  buildGroups()

  // Build Lists
  buildLists()

  function rebuild() {
    loader('start', true)
    qi('home-download').style.visibility = 'hidden'
    if (qi('comic')) document.body.removeChild(qi('comic'))
    q('.carousel-inner', {retType: 'array'}).forEach(e => e.innerHTML = '')
    q('div[id*="-desc"]', {retType: 'array'}).forEach(e => e.innerHTML = '')
    q('#paginate').style.display = 'none'
    q('#search').style.display = 'block'
    q('#title').textContent = ''
    q('#title').style.display = 'none'
  }
}

function buildTile(tile, section, first, position = 0) {
  let defaultImage = false;
  const defaultImageTO = setTimeout(() => defaultImage = true, 20000)
  const sect = section.replace(/(tab|-)/g, '')
  const comicDiv = qi(`${sect}`).querySelector('.carousel-inner')

  const container = create('div', {class: ['flex-col', 'carousel-container'], 'data-position': position})
  const img = create('img',
    {
      'data-link': tile.link,
      'data-section': sect,
      class: 'link',
      src: tile.img,
      style: {width: '20vw', margin: '0 2.25vw'}
    },
    {
      'error': onerr,
      'load': onload,
      'click': () => navigation('description', {link: tile.link, section: sect, cover: tile.img, view: 'i'})
    }
  )

  const title = create('span',
    {
      'data-link': tile.link,
      'data-section': sect,
      class: 'link',
      innerText: tile.title,
      style: {color: 'white', margin: '7px'}
    },
    {'click': () => navigation('description', {link: tile.link, section: sect, cover: tile.img, view: 'd'})}
  )
  if (section === 'recent') container.id = tile.title.replace(/[\s()]/g, '')

  appendChildren(container, img, title)

  if (!defaultSection(sect)) {
    const arrowDiv = create('div', {class: [`${sect}-arrows`, 'flex-row', 'jc-sa', 'ai-c', 'overflow-h']})
    const left = create('span', {class: ['fas', 'fa-arrow-circle-left'], 'data-position': position}, {'click':  function() {moveComic('l', sect, container)}})
    const right = create('span', {class: ['fas', 'fa-arrow-circle-right'], 'data-position': position}, {'click': function() {moveComic('r', sect, container)}})

    appendChildren(arrowDiv, left, right)
    appendChildren(container, arrowDiv)
  }

  if (first) comicDiv.insertBefore(container, comicDiv.children[0])
  else comicDiv.appendChild(container)

  // The page will often send 503 errors for the images, so
  // this will keep trying to load it until it doesn't error
  // Obviously, there's no failsafe here, so if there's a
  // legitimate error (like a 404), it will try into oblivion
  // TODO: Set a default image after x amount of tries
  function onerr(e) {
    if (!defaultImage) setTimeout(() => e.target.src = e.target.currentSrc, 2000)
    else {
      e.target.src = 'https://i.imgur.com/T1I1PZa.jpg'
      e.target.style.width = '20vw'
      e.target.style.height = 'auto'
    }
  }

  function onload() {
    clearTimeout(defaultImageTO)
  }
}

function defaultSection(sect) {
  return sect === 'recent' ||
    sect === 'newest' ||
    sect === 'topday' ||
    sect === 'topweek' ||
    sect === 'topmonth' ||
    sect === 'mostview' ||
    sect === 'latest' ||
    sect === 'search'
}

// Building groups
function buildGroups(add) {
console.log('build groups: ', GROUPS.length)
  if (!GROUPS.length) return

  if (add) {
    buildSection(add.group, 1)
    return
  }

  GROUPS.forEach( group => {
    if (!group.hasOwnProperty('sectionID') || !group.hasOwnProperty('sectionTitle')) return
    if (q(`#${group.sectionID}`)) return

    buildSection(group, 2)

    const database = readDB(group.sectionID)
    const sortedDB = Object.keys(database).sort((a, b) => {
      return database[b].position - database[a].position
    })

    sortedDB.forEach( c => {
      const comic = database[c]
      GROUP_ISSUE_ARRAY.push({title: c, db: group.sectionTitle})
      buildTile(new TILE(c, comic.cover, comic.link),  group.sectionID, false, comic.position)
    })
  })

  function buildSection(group) {
    // Odd spacing here to show how all the elements relate to each other

    // Main Div that houses the whole group
    const mainDiv = create('div', {class: 'section-title', id: `${group.sectionID}-text`})
    // Title / Heading
    const sectionText = create('p')
      sectionText.textContent = group.sectionTitle.toUpperCase()
    // Menu hamburger icons
    const menuIconsContainer = create('div', {class: 'menu-icons-container', id: `${group.sectionID}-text_menu`}, {'click': function() {titleMenuToggle(`${group.sectionID}-text`)}})
      const menuIcon1 = create('div', {class: 'menu-icons'})
      const menuIcon2 = create('div', {class: 'menu-icons'})
      const menuIcon3 = create('div', {class: 'menu-icons'})
    appendChildren(menuIconsContainer, menuIcon1, menuIcon2, menuIcon3)
    // Menu icons (after clicking hamburger)
    const titleMenuContainer = create('div', {class: 'title-menu_container', id: `${group.sectionID}-title-menu`})
      const titleMenu = create('div', {class: 'title-menu'})
        const reverseIcon = create('i', {class: ['fas', 'fa-arrows-alt-h'], title: 'reverse order'}, {'click': function() {changeSort(group.sectionID)}})
        const changeOrderIcon = create('i', {class: ['fas', 'fa-arrows-alt'], title: 'change order'}, {'click': function() {arrangeComics(group.sectionID, this)}})
        const deleteGroupIcon = create('i', {class: ['fas', 'fa-trash-alt'], title: 'delete group'}, {'click': function() {deleteGroupClick(group.sectionID)}})
        const deleteMenu = create('div', {class: 'delete-menu'})
          const sure = create('p', {style: {marginLeft: '5px'}})
          sure.textContent = 'Are you sure?'
          const yes = create('span', {style: {color: '#920223', marginLeft: '5px'}}, {'click': () => deleteGroup(group.sectionID)})
          yes.textContent = 'Yes'
          const slash = create('span', {style: {marginLeft: '2px'}})
          slash.textContent = '/'
          const no = create('span', {style: {marginLeft: '2px'}}, {'click': () => deleteGroupClick(group.sectionID)})
          no.textContent = 'No'
          appendChildren(deleteMenu, sure, yes, slash, no)
      appendChildren(titleMenu, reverseIcon, changeOrderIcon, deleteGroupIcon, deleteMenu)
    titleMenuContainer.appendChild(titleMenu)
    // Carousel
    const carouselOuter = create('div', {class: 'carousel-outer', id: group.sectionID})
      const carouselInner = create('div', {class: 'carousel-inner'})
    carouselOuter.appendChild(carouselInner)
    // Description
    const desc = create('div', {class: 'section-desc', id: `${group.sectionID}-desc`})

    appendChildren(mainDiv, sectionText, menuIconsContainer, titleMenuContainer)

    reader.insertBefore(desc, q('.addGroup').nextElementSibling)
    reader.insertBefore(carouselOuter, q('.addGroup').nextElementSibling)
    reader.insertBefore(mainDiv, q('.addGroup').nextElementSibling)
  }
}

function buildLists(name = '') {
  const listlist = qi('listlist')

  if (name) {
    addList(name)
    return
  }

  listlist.innerHTML = ''
  if (!LISTS.length) return

  LISTS.forEach( l => {
    addList(l)
  })

  function addList(n) {
    const listDiv = create('div')
    const delIcon = create('i', {class: ['fa', 'fa-trash-alt']}, {'click': () => removeIssueList(n)})
    const span = create('span', {draggable: true, style: {marginLeft: '12px'}, class: 'link'}, {'click': () => toggleListIssues(n)})
    span.textContent = n
    appendChildren(listDiv, delIcon, span)
    appendChildren(listlist, listDiv)
  }
}

function removeIssueList(list) {
  deleteListFromDB(list)
  LISTS = getDB('lists')
  buildLists()
}

function toggleListIssues(list) {
  const listlist = qi('listlist')
  const issuelist = qi('issuelist')
  if (!issuelist.style.display) issuelist.style.display = 'none'
  if (issuelist.style.display === 'none') {
    buildIssueList()
  } else {
    listlist.style.display = 'flex'
    issuelist.style.display = 'none'
    issuelist.innerHTML = ''
  }

  let dragItem

  function listItemClick(opts) {

    for (let key in opts) {
      if (currentComic.hasOwnProperty(key) && opts.hasOwnProperty(key)) currentComic[key] = opts[key]
    }

    navigation('comic', opts)
  }

  function dragStart(evt) {
    dragItem = evt.target
  }

  function dragOver(evt) {
    evt.preventDefault()
    if (evt.target.nodeName === 'DIV'){
      evt.target.style.paddingBottom = '25px'
    } else {
      evt.target.parentElement.style.paddingBottom = '25px'
    }
  }

  function dragLeave(evt) {
    evt.preventDefault()
    if (evt.target.nodeName === 'DIV'){
      evt.target.style.paddingBottom = '0px'
    }
  }

  function dropTarget(evt) {
    evt.preventDefault()
    const dropItem = evt.target.nodeName === 'DIV' ? evt.target : evt.target.parentElement
    dropItem.style.paddingBottom = '0px'
    moveListIssues(list, dragItem.dataset.position, dropItem.dataset.position)
    buildIssueList()
  }

  function deleteIssue(title, issue) {
    deleteListIssue(list, title, issue)
    buildIssueList()
  }

  function buildIssueList() {
    const issues = list ? getDB(list) : []
    listlist.style.display = 'none'
    issuelist.style.display = 'flex'
    issuelist.innerHTML = ''
    appendChildren(issuelist, create('span', {textContent: '< Back', class: 'link'}, {'click': toggleListIssues}))
    if (!issues.length) {
      appendChildren(issuelist, create('span', {textContent: 'No Issues Added To List'}))
    } else {
      issues.forEach( (issue) => {
        const txt = `${issue.title} - ${issue.issue}`
        const opts = {
          title: issue.title,
          issue: issue.issue,
          link: issue.link,
          cover: issue.cover
        }

        const issueDiv = create('div',
          {draggable: true, style: { borderBottom: '1px solid #920223'}, 'data-position': issue.position},
          {
            'dragstart': dragStart,
            'dragover': dragOver,
            'dragleave': dragLeave,
            'drop': dropTarget
          }
        )

        appendChildren(issuelist,
          appendChildren(issueDiv,
            create('span', {textContent: txt, class: 'link', style: {marginLeft: '5px'}}, {'click': () => listItemClick(opts)}),
            create('i', {class: ['fas', 'fa-trash-alt'], style: {float: 'right'}}, {'click': () => deleteIssue(issue.title, issue.issue)}),
            'return'
          ))
      })
    }
  }
}

function deleteGroupClick(section, close = false) {
  const deleteMenu = q(`#${section}-title-menu > .title-menu > .delete-menu`)

  if (close) {
    deleteMenu.style.display = 'none'
    return
  }

  if (!deleteMenu.style.display || deleteMenu.style.display === 'none') deleteMenu.style.display = 'inline-flex'
  else deleteMenu.style.display = 'none'
}

function deleteGroup(section) {
  const cm = q(`#${section} > .carousel-inner`).querySelectorAll('.carousel-container')
  let comics

  if (cm) {
    comics = [...cm]
    const titles = comics.map(c => c.querySelector('span').textContent)
    let indices = []
    GROUP_ISSUE_ARRAY.forEach((g, i) => {
      if (titles.includes(g.title)) {
        indices.push(i)
      }
    })
    if (indices.length) {
      indices.reverse().forEach( i => {
        GROUP_ISSUE_ARRAY.splice(i, 1)
      })
    }
  }
  [ `${section}-text`, `${section}`, `${section}-desc` ]
    .map( s => qi(s))
    .forEach( ele => ele.parentElement.removeChild(ele))

  deleteGroupDB(section)
  setTimeout(() => GROUPS = getDB('groups', {type: 'arr'}), 1000)
  toast('Group Successfully Deleted!')
}

// This is the function to "navigate" between pages
// in the render div
// e: link, section, cover
function navigation(page, e) {
  // Shows the description of the selected comic
  if (page === 'description') buildDescription(e)
  // Load the comic
  else buildComic(e)
}

function buildDescription(evt) {
  if (evt.nf) {
    loader('stop')
    const descContainer = create('div', {style: {padding: '12px', border: '#5E051D 2px solid', marginBottom: '10px', display: 'flex', justifyContent: 'flex-start'}})
    const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '20px'}}, {'click': () => qi(`${evt.section}-desc`).innerHTML = ''})
    const info = create('div', {style: {width: '35%'}, class: 'flex-col'})
    const nf = create('p')
    nf.textContent = 'Not found'
    info.appendChild(nf)
    descContainer.appendChild(closeDesc)
    descContainer.appendChild(info)
    qi(`${evt.section}-desc`).appendChild(descContainer)
    return
  }

  loader('start')
  //Scroll the selected section to the top of the page in a fancy slow move
  if (evt.section !== 'search' && evt.section !=='mostview') scrollSection(qi(`${evt.section}`))
  const descId = `${evt.section}-desc`
  const comicLink = (() => {
    const lnk = evt.link.split('/')
    const lst = lnk[lnk.length - 1]
    if (lst.includes('Issue-') && lst.includes('?id=')) {
      lnk.splice(lnk.length - 1)
    }
    return lnk.join('/')
  })()
  const view = evt.view ? evt.view : 'i'

  let desc
  let comicCover = evt.cover

  function ipcMessage(e) {
    if (e.channel === 'msg') {
      console.log(e.args[0])
      return
    }

    clearHidden()
    desc = qi(descId)
    const descArgs = e.args[0].desc
    comicTitle = descArgs.title
    if (!comicCover) comicCover = descArgs.cover

    // titleHeader is the title header. It contains the title of the comic,
    // the "Go to Comic" and "Add to Group", and the close button
    const titleHeader = create('div', {class: 'desc-title'})
      // Title of the comic
      const title = create('p', {textContent: descArgs.title, style: {width: '100%'}})
      // Div to house the 'X' to close description/issues
      const closeDescription = create('div', {
        style: {
          textAlign: 'right',
          position: 'absolute',
          right: '15px'
        }
      }, {'click': () => desc.innerHTML = ''})
      // 'X' to close description/issues
      const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '20px'}})

    const secondaryBar = create('div', {class: ['flex-row', 'jc-sb']})
      // Contains 'Add to/Remove from Reading List' and 'Show Issues/Description'
      const optionsContainer = create('div', {
        'style': {display: 'flex', flexDirection: 'row', margin: '10px'},
        class: 'section-desc_options'
      })
      // Icon for 'Show Issues'
      const descReadIcon = create('span', {class: ['fas', 'fa-list'], id: 'desc-read-icon', style: {display: 'block'}})
      // Span: 'Show Issues'
      const listIssues = create('span', {
        class: ['desc-show-issues', 'link'],
        textContent: 'Issues'
      }, {'click': () => toggleView('i')})
      // Icon for 'Show Description'
      const descIssuesIcon = create('span', {
        class: ['fas', 'fa-book'],
        id: 'issues-icon',
        style: {marginLeft: '10px', display: 'block'}
      })
      // Span: 'Show Description'
      const showDescription = create('span', {
        class: ['issues-show-desc', 'link'],
        textContent: 'Description'
      }, {'click': () => toggleView('d')})
      // Icon for 'Add To Reading List'
      const addIcon = create('span', {class: ['fas', 'fa-plus']})
      // Span: 'Add To Reading List'
      const addToGroup = create('span', {class: 'link', textContent: 'Add To Group'}, {'click': () => toggleView('g')})
      // Icon for 'Remove From Reading List'
      const removeIcon = create('span', {class: ['fas', 'fa-minus']})
      // Span: 'Remove From Reading List'
      const removeFromGroup = create('span', {
        class: 'link',
        textContent: ''
      })
    // Decides whether to add Add or Remove to/from Reading List icons
    if (defaultSection(evt.section)) {
      let foundDB

      function findComic(group) {
        const found = group.title === comicTitle

        if (found) foundDB = group.db
        return found
      }

      if (GROUP_ISSUE_ARRAY.find(g => findComic(g))) {
        optionsContainer.appendChild(removeIcon)
        removeFromGroup.textContent = foundDB === 'reading' ? 'Remove from Reading List' : `Remove from ${foundDB} Group`
        removeFromGroup.addEventListener('click', () => removeComicFromGroup(GROUPS.find(g => g.sectionTitle === foundDB).sectionID))
        optionsContainer.appendChild(removeFromGroup)
      } else {
        optionsContainer.appendChild(addIcon)
        optionsContainer.appendChild(addToGroup)
      }
    } else {
      optionsContainer.appendChild(removeIcon)
      removeFromGroup.textContent = evt.section === 'reading' ? 'Remove from Reading List' : `Remove from Group`
      removeFromGroup.addEventListener('click', () => removeComicFromGroup(evt.section))
      optionsContainer.appendChild(removeFromGroup)
    }

    // Right side options
    const rightSideOptions = create('div', {class: ['flex-row', 'right-side_options']})
    // (Un)Check All
    const uncheckDiv = create('div', {class: ['link', 'flex-row', 'ai-c']}, {'click': () => toggleAllIssueChecks(false)})
      const uncheckIcon = create('i', {class: ['fas', 'fa-times']})
      const uncheckText = create('span', {textContent: 'Uncheck All', class: 'link'})
    const checkDiv = create('div', {class: ['link', 'flex-row', 'ai-c']}, {'click': () => toggleAllIssueChecks(true)})
      const checkIcon = create('i', {class: ['fas', 'fa-check']})
      const checkText = create('span', {textContent: 'Check All', class: 'link'})
    // Add To List
    const addToListDiv = create('div', {class: ['arrow-div', 'link']}, {'click': () => toggleView('l')})
      const addToListIcon = create('i', {class: ['fas', 'fa-list']})
      const addToList = create('span', {textContent: 'Add To List'})

    appendChildren(uncheckDiv, uncheckIcon, uncheckText)
    appendChildren(checkDiv, checkIcon, checkText)
    appendChildren(addToListDiv, uncheckDiv, checkDiv, addToListIcon, addToList)
    appendChildren(rightSideOptions, uncheckDiv, checkDiv, addToListDiv)
    appendChildren(optionsContainer, descReadIcon, listIssues, descIssuesIcon, showDescription)
    appendChildren(secondaryBar, optionsContainer, rightSideOptions)
    appendChildren(closeDescription, closeDesc)
    appendChildren(titleHeader, title, closeDescription)

    // Issue Lists
    const listContainer = create('div', {class: 'group-container', style: {borderBottom: 'none'}})
    if (!LISTS.length) {
      const empty = create('span', {textContent: 'No Lists Created'})
      appendChildren(listContainer, empty)
    } else {
      LISTS.forEach( l => {
        const a = create('span', {textContent: l, class: 'link'}, {'click': () => addIssuesToList(l, descArgs.title, descArgs.cover)})
        appendChildren(listContainer, a)
      })
    }

    // Description
    const descContainer = create('div', {class: 'desc-info'})
    const info = create('div', {style: {width: '35%'}, class: 'flex-col'})
    const genre = create('p', {
      textContent: `${descArgs.genres.length > 1 ? 'Genres' : 'Genre'}: ${descArgs.genres.join(', ')}`,
      fontWeight: 'bold'
    })
    const writer = create('p', {
      textContent: `${descArgs.writer.length > 1 ? 'Writers' : 'Writer'}: ${descArgs.writer.join(', ')}`,
      fontWeight: 'bold'
    })
    const artist = create('p', {
      textContent: `${descArgs.artist.length > 1 ? 'Artists' : 'Artist'}: ${descArgs.artist.join(', ')}`,
      fontWeight: 'bold'
    })
    const publisher = create('p', {
      textContent: `${descArgs.publisher.length > 1 ? 'Publishers' : 'Publisher'}: ${descArgs.publisher.join(', ')}`,
      fontWeight: 'bold'
    })
    const publicationdate = create('p', {textContent: `Publication Date: ${descArgs.publicationdate}`})

    appendChildren(info, genre, writer, artist, publisher, publicationdate)

    appendChildren(descContainer, info)

    const summary = create('div', {style: {width: '60%'}, class: ['flex-col']})
    const summaryTitle = create('p', {textContent: 'Summary:'})
    const summarySummary = create('p', {textContent: descArgs.summary})

    appendChildren(summary, summaryTitle, summarySummary)
    appendChildren(descContainer, summary)

    if (desc.children.length) desc.innerHTML = ''


    if (evt.section === 'search') {
      const coverImg = create('img', {src: comicCover, style: {height: '150px', width: '115px', marginLeft: '10px'}})
      appendChildren(descContainer, coverImg)
    }
    appendChildren(desc, titleHeader, secondaryBar, listContainer, descContainer)

    // Build issues
    const ishArgs = e.args[0].issues
    const issueContainer = create('div', {class: 'issue-container'})

    const sortedIssuesArray = sortIssues(Object.keys(ishArgs))

    sortedIssuesArray.forEach(i => {
      let spanClass = 'link'
      if (recentDB[comicTitle] && recentDB[comicTitle].issues[getIssue(i, 'issue')]) spanClass = 'link-read'
      const linkDiv = create('div', {style: {display: 'inline-block', textAlign: 'center', width: '100%'}})
      const c = create('input', {type: 'checkbox', style: {display: 'inline-block'}})
      const a = create('span', {textContent: getIssue(i, 'issue'), style: {display: 'inline-block'}, 'data-link': ishArgs[i], class: spanClass})
      appendChildren(linkDiv, c, a)
      issueContainer.appendChild(linkDiv)
    })

    desc.appendChild(issueContainer)

    if (q('.issue-container span').length) {
      q('.issue-container span').forEach(i => i.addEventListener('click', onclick))
    } else {
      q('.issue-container span').addEventListener('click', onclick)
    }

    // Set up groups
    const groupContainer = create('div', {class: 'group-container'})
    const readingList = create('span', {textContent: 'Reading List', 'data-link': 'reading', class: 'link'}, {'click': () => addComicToGroup('reading')})
    groupContainer.appendChild(readingList)

    GROUPS.forEach( g => {
      const a = create('span', {textContent: g.sectionTitle, 'data-link': g.sectionID, class: 'link'}, {'click': () => addComicToGroup(g.sectionID)})
      groupContainer.appendChild(a)
    })

    desc.appendChild(groupContainer)

    toggleView(view)

    function onclick(e) {
      currentComic.title = comicTitle
      currentComic.cover = comicCover
      currentComic.link = comicLink
      navigation('comic', {title: comicTitle, issue: e.target.textContent, link: e.target.dataset.link})
    }

    function toggleView(v) {
      let noneArr, blockArr, flexArr = []

      if (v === 'i') {
        noneArr = [
          descContainer,
          descReadIcon,
          listIssues,
          listContainer,
          groupContainer
        ]

        blockArr = [
          descIssuesIcon,
          issueContainer,
          showDescription
        ]
        flexArr = [rightSideOptions]
      } else if (v === 'd') {
        flexArr = [descContainer]
        blockArr = [descReadIcon, listIssues]
        noneArr = [
          groupContainer,
          issueContainer,
          descIssuesIcon,
          showDescription,
          rightSideOptions,
          listContainer
        ]
      } else if (v === 'g') {
        noneArr = [descContainer, issueContainer, rightSideOptions]
        blockArr = [
          descReadIcon,
          listIssues,
          groupContainer,
          descIssuesIcon,
          showDescription
        ]
      } else if (v === 'l') {
        noneArr = [descContainer, groupContainer]
        blockArr = [
          issueContainer,
          descIssuesIcon,
          showDescription,
          listContainer
        ]
        flexArr = [rightSideOptions]
      }

      noneArr.forEach( i => i.style.display = 'none')
      blockArr.forEach( i => i.style.display = 'block')
      flexArr.forEach( i => i.style.display = 'flex')
    }

    function addComicToGroup(group) {
      const icon = descReadIcon.style.display === 'none' ? descIssuesIcon : descReadIcon
      removeFromGroup.textContent = group === 'reading' ? 'Remove from Reading List' : `Remove from ${GROUPS.find( g => g.sectionID === group).sectionTitle} Group`
      optionsContainer.removeChild(addIcon)
      optionsContainer.removeChild(addToGroup)
      removeFromGroup.addEventListener('click', () => removeComicFromGroup(group))
      optionsContainer.insertBefore(removeFromGroup, icon)
      optionsContainer.insertBefore(removeIcon, removeFromGroup)
      groupAdd(group)
    }

    function removeComicFromGroup(group) {
      const icon = descReadIcon.style.display === 'none' ? descIssuesIcon : descReadIcon
      optionsContainer.removeChild(removeIcon)
      optionsContainer.removeChild(removeFromGroup)
      optionsContainer.insertBefore(addToGroup, icon)
      optionsContainer.insertBefore(addIcon, addToGroup)
      groupRemove(group)
    }
  }

  function groupAdd(section) {
    if (qi(`${section}-text`).style.display === `none`) qi(`${section}-text`).style.display = `block`
    if (qi(`${section}`).style.display === `none`) qi(`${section}`).style.display = `block`
    const comic = {title: comicTitle, link: comicLink, cover: comicCover}
    const position = writeToDB(comic, `${section}`)
    GROUP_ISSUE_ARRAY.push({db: section, title: comicTitle})
    buildTile(new TILE(comicTitle, comicCover, comicLink), `${section}`, true, position)
    toast(`${comicTitle} successfully added!`)
  }

  function groupRemove(section) {
    const comic = {title: comicTitle, link: comicLink, cover: comicCover}
    q(`#${section} .carousel-inner`).removeChild(document.querySelector(`img[data-link="${comicLink}"]`).parentNode)
    q(`#${section}-desc`).innerHTML = ''
    GROUP_ISSUE_ARRAY.splice(GROUP_ISSUE_ARRAY.findIndex(g => g.title === comicTitle))
    deleteFromDB(comic, section)
    toast(`${comicTitle} successfully removed!`)
  }

  bgRender(comicLink, './js/preload/description.preload.js', {'ipc-message': ipcMessage})
}

function scrollSection(section) {
  const currentScroll = reader.scrollTop
  const sectionScroll = section === 'search' ? 0 : section.offsetTop - 65

  if (sectionScroll <= currentScroll - 5) {
    reader.scrollTop -= 3
    setTimeout(scrollSection, 0, section)
  } else if (sectionScroll >= currentScroll + 5) {
    reader.scrollTop += 3
    setTimeout(scrollSection, 0, section)
  } else if (sectionScroll < currentScroll || sectionScroll > currentScroll) {
    reader.scrollTop = sectionScroll
  }
}

function submitInput(e, f) {
  if ( (e.keyCode || e.which) === 13) f()
}

function showListInput() {
  const listDiv = qi('newListDiv')
  const tr = listDiv.style.transform
  if (!tr || tr === 'translateY(-26px)') {
    listDiv.style.transform = 'translateY(0px)'
    qi('list-plus').style.transform = 'rotate(45deg)'
    qi('list-name').focus()
  } else {
    listDiv.style.transform = 'translateY(-26px)'
    qi('list-plus').style.transform = 'rotate(0deg)'
  }
}

function createList() {
  showListInput()
  const name = qi('list-name').value
  qi('list-name').value = ''
  createIssueList(name)
  LISTS = getDB('lists')
  buildLists(name)
}

function toggleAllIssueChecks(type) {
  const inputs = q('input[type="checkbox"]')
  inputs.forEach( input => {
    input.checked = type
  })
}

function addIssuesToList(db, title, cover) {
  const inputs = q('input[type="checkbox"]')

  if (!inputs && !inputs.length) {
    toast('No issues selected')
    return
  }

  if (!inputs.length) {
    const issue = inputs.nextElementSibling
    addIssuesToListDB(db, title, issue.textContent, issue.dataset.link, cover)
  } else {
    inputs.forEach( c => {
      if (c.checked) {
        const issue = c.nextElementSibling
        addIssuesToListDB(db, title, issue.textContent, issue.dataset.link, cover)
      }
    })
  }

  const ish = inputs.length ? 'Issues' : 'Issue'
  toast(`${ish} added to list!`)
}

function showAddGroup() {
  const container = qc('addGroup-groupName_container')
  const plus = qc('addGroup-icons').querySelector('.fa-plus')
  qi('group-name').focus()
  if (!container.style.transform) container.style.transform = 'translateY(-25px)'
  if (container.style.transform === 'translateY(0px)') {
    container.style.transform = 'translateY(-25px)'
    plus.style.transform = 'rotate(0deg)'
  } else {
    container.style.transform = 'translateY(0px)'
    plus.style.transform = 'rotate(45deg)'
  }
}

function addGroup() {
  const sectionTitle = qi('group-name').value
  qi('group-name').value = ''
  if (!sectionTitle) return
  showAddGroup()
  const sectionID = createUniqueID()

  createGroup(sectionID, sectionTitle)
  GROUPS.push({sectionID, sectionTitle})
  buildGroups({group: {sectionID, sectionTitle}})
  toast('Group Successfully Added!')
}

function createUniqueID() {
  let sectionID = ''
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

  for (let i = 0; i < 7; i++)
    sectionID += possible.charAt(Math.floor(Math.random() * possible.length))

  let uniqueID = true

  for (let prop in GROUPS) {
    if (!GROUPS.hasOwnProperty(prop)) return

    if (GROUPS[prop].sectionID === sectionID) uniqueID = false
  }

  if (!uniqueID) return createUniqueID()
  else return sectionID
}

function titleMenuToggle(sectionId) {
  const menu = q(`#${sectionId.split('-')[0]}-title-menu > .title-menu`)
  const bars = q(`#${sectionId}_menu > .menu-icons`)

  if (!menu.style.transform) menu.style.transform = 'translateX(-100px)'

  menu.style.transform = menu.style.transform !== 'translateX(-100px)'
    ? 'translateX(-100px)'
    : 'translateX(0px)'

  if (menu.style.transform !== 'translateX(-100px)') {
    bars.forEach( (b, i) => {
      switch (i) {
        case 0:
          b.classList.remove('bar-animate_top_close')
          b.classList.add('bar-animate_top_open')
          break
        case 1:
          b.classList.remove('bar-animate_middle_close')
          b.classList.add('bar-animate_middle_open')
          break
        case 2:
          b.classList.remove('bar-animate_bot_close')
          b.classList.add('bar-animate_bot_open')
          break
        default: break
      }
    })
  } else {
    bars.forEach( (b, i) => {
      switch (i) {
        case 0:
          b.classList.remove('bar-animate_top_open')
          b.classList.add('bar-animate_top_close')
          break
        case 1:
          b.classList.remove('bar-animate_middle_open')
          b.classList.add('bar-animate_middle_close')
          break
        case 2:
          b.classList.remove('bar-animate_bot_open')
          b.classList.add('bar-animate_bot_close')
          break
        default: break
      }
    })
    arrangeComics(sectionId.split('-')[0], menu.querySelectorAll('i')[1], true)
    if (sectionId !== 'reading') deleteGroupClick(sectionId.split('-')[0], true)
  }
}

function arrangeComics(sectionId, self, close = false) {
  const a = qc(`${sectionId}-arrows`)
  let arrows

  if (a) arrows = [ ...a ]
  else return

  if (close) {
    self.style.transform = 'rotate(0deg)'
    arrows.forEach( a => a.querySelectorAll('span').forEach( arrow => arrow.style.transform = 'translateY(-20px)'))
    return
  }

  const [ trans, deg ] = self.style.transform !== 'rotate(45deg)'
      ? [ 'translateY(0px)', 45 ]
      : [ 'translateY(-20px)', 0 ]

  arrows.forEach( a => a.querySelectorAll('span').forEach( arrow => arrow.style.transform = trans))
  arrows[0].querySelector('span').style.visibility = 'hidden'
  arrows[arrows.length - 1].querySelectorAll('span')[1].style.visibility = 'hidden'
  self.style.transform = `rotate(${deg}deg)`
}

function moveComic(direction, section, comic) {
  const position = comic.dataset.position
  const row = q(`#${section} .carousel-inner`)

  if (position === '0' && direction === 'r') return
  if (position === `${row.length}` && direction === 'l') return

  const selectedComic = row.querySelector(`div[data-position="${position}"]`)
  const comicToMove = direction === 'l' ? row.querySelector(`div[data-position="${parseInt(position) + 1}"]`) : row.querySelector(`div[data-position="${parseInt(position) - 1}"]`)

  if (direction === 'l') row.insertBefore(selectedComic, comicToMove)
  else row.insertBefore(comicToMove, selectedComic)

  selectedComic.dataset.position = `${direction === 'l' ? (+selectedComic.dataset.position + 1) : (+selectedComic.dataset.position - 1)}`
  comicToMove.dataset.position = `${direction === 'l' ? (+selectedComic.dataset.position - 1) : (+selectedComic.dataset.position + 1)}`

  const comic1 = {title: selectedComic.querySelector('span').textContent, cover: selectedComic.querySelector('img').src, link: selectedComic.querySelector('img').dataset.link, position: selectedComic.dataset.position}
  const comic2 = {title: comicToMove.querySelector('span').textContent, cover: comicToMove.querySelector('img').src, link: comicToMove.querySelector('img').dataset.link, position: comicToMove.dataset.position}

  updateDB(comic1, comic2, section)

  if (position === '1') {
    selectedComic.querySelector(`.${section}-arrows`).querySelectorAll('span')[1].style.visibility = 'visible'
    comicToMove.querySelector(`.${section}-arrows`).querySelectorAll('span')[1].style.visibility = 'hidden'
  } else if (position === '2' && direction === 'r') {
    comicToMove.querySelector(`.${section}-arrows`).querySelectorAll('span')[1].style.visibility = 'visible'
    selectedComic.querySelector(`.${section}-arrows`).querySelectorAll('span')[1].style.visibility = 'hidden'
  } else if (position === `${row.children.length}`) {
    selectedComic.querySelector(`.${section}-arrows`).querySelectorAll('span')[0].style.visibility = 'visible'
    comicToMove.querySelector(`.${section}-arrows`).querySelectorAll('span')[0].style.visibility = 'hidden'
  } else if (position === `${row.children.length - 1}` && direction === 'l') {
    comicToMove.querySelector(`.${section}-arrows`).querySelectorAll('span')[0].style.visibility = 'visible'
    selectedComic.querySelector(`.${section}-arrows`).querySelectorAll('span')[0].style.visibility = 'hidden'
  }
}

function changeSort(sectionId) {
  const row = q(`#${sectionId} .carousel-inner`)
  const comics = q(`#${sectionId} .carousel-inner .carousel-container`)
  if (!comics) return

  comics.forEach( (c, i) => {
    if (!i) return
    row.insertBefore(c, row.children[0])
  })
}

function buildComic(evt) {
  loader('start', true, 300)
  // Save to Recently Read database
  // Set up Home and download button

  qi('home-download').style.visibility = 'visible'
  qi('title-buttons').style.visibility = 'hidden'
  showLists('closed')

  // TODO: This will show/hide the download button based on the downloaded database
  // TODO: Unfortunately it doesn't take into account locally deleting the files, since
  // TODO: I don't have an offline / downloaded reader built yet.
  // TODO: So I'm commenting it out for now.
  // let downloadedDB
  //
  // if (fs.existsSync('./database/downloaded.database.json')) {
  //   downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  // } else {
  //   fs.writeFile('./database/downloaded.database.json', '{}')
  //   downloadedDB = {}
  // }
  // if (
  //   downloadedDB[currentComic.title] && downloadedDB[currentComic.title].issues.find(i => i.issue === getIssue(e.issue, 'issue')))
  // ) qi('download').style.visibility = 'hidden'

  const baseLink = currentComic.link
  const comicLink = evt.link

  function ipcMessage(e) {
    if (e.channel === 'msg') {
      console.log(e.args[0])
      return
    }
    clearHidden()

    let comicPanel, comicDiv

    if (!q('#comic')) {
      comicPanel = create('div', {class: 'reader-view', id: 'comic', style: {zIndex: '2'}})
      comicDiv = create('div', {class: ['flex-col', 'jc-c']})
      comicPanel.appendChild(comicDiv)
    } else {
      comicPanel = q('#comic')
      comicDiv = q('#comic > div')
      comicDiv.innerHTML = ''
    }
    currentComic.issue = e.args[0].nav.selectedIssue
    writeRecent(currentComic, comicLink)

    e.args[0].images.forEach(i => {
      const img = create('img', {src: i, style: {width: '100%', height: 'auto'}}, {'mousedown': rightClickImage})
      comicDiv.appendChild(img)
    })
    document.body.appendChild(comicPanel)

    qi('paginate').style.display = 'flex'
    qi('search').style.display = 'none'
    qi('title').style.display = 'block'
    qi('title').textContent = currentComic.title
    const issueSelect = qi('issue-select')
    const nav = e.args[0].nav
    issueSelect.innerHTML = ''
    nav.issues.forEach(opt => {
      const option = create('option', {value: `${baseLink}/${opt.val}`, textContent: opt.txt, 'data-issue': opt.txt})
      if (opt.txt === currentComic.issue) option.selected = 'selected'
      issueSelect.add(option)
    })
    issueSelect.style.display = 'block'

    if (!nav.next) qi('nextButton').style.visibility = 'hidden'
    else {
      qi('nextButton').style.visibility = 'visible'
      nextIssue = nav.next
    }

    if (!nav.prev) qi('prevButton').style.visibility = 'hidden'
    else {
      qi('prevButton').style.visibility = 'visible'
      previousIssue = nav.prev
    }

    function rightClickImage(evnt) {
      const menu = qi('rotate-menu')
      if (menu) q('body').removeChild(menu)

      if (evnt.which === 3) rightClickMenu({target: evnt.target, x: evnt.clientX, y: evnt.clientY})
    }
  }

  bgRender(evt.link + '&readType=1', './js/preload/comic.preload.js', {'ipc-message': ipcMessage})
}

function rightClickMenu(coords = {target: null, x: 0, y: 0}) {
  const { target, x, y } = coords
  const div = create('div', {
    style: {
      position: 'absolute',
      left: x + 'px',
      top: y + 'px',
      width: '85px',
      height: '57px',
      backgroundColor: 'white',
      border: '1px solid black',
      color: 'black',
      display: 'flex',
      flexDirection: 'column',
      zIndex: '3',
      textAlign: 'center'
    },
    id: 'rotate-menu'
  })
  const left = create('p', {class: 'link',
    style: {
      width: '100%',
      height: '18px',
      borderBottom: '1px solid black',
      fontSize: '12px',
      margin: 0
    }}, {'click': () => rotate('l')})
  const right = create('p', {class: 'link',
    style: {
      width: '100%',
      height: '18px',
      borderBottom: '1px solid black',
      fontSize: '12px',
      margin: 0,
      paddingTop: '1px'
  }}, {'click': () => rotate('r')})
  const copyImage = create('p', {class: 'link',
    style: {
      width: '100%',
      height: '18px',
      fontSize: '12px',
      margin: 0,
      paddingTop: '1px'
  }}, {'click': () => imageCopy(target.src)})
  left.innerText = 'Rotate Left'
  right.innerText = 'Rotate Right'
  copyImage.innerText = 'Copy Image'
  appendChildren(div, left, right, copyImage)
  q('body').appendChild(div)

  function rotate(dir) {
    const s = target.style
    let rotateAmount

    const alreadyRotated = !!s.transform.match(/deg/)
    if (!alreadyRotated && dir === 'r') rotateAmount = 90
    else if (!alreadyRotated && dir === 'l') rotateAmount = 270
    else {
      let currentRotation = +s.transform.slice(7, 9)
      if (currentRotation !== 90) currentRotation = currentRotation * 10
      if (dir === 'l') rotateAmount = currentRotation - 90 <= 0 ? 0 : currentRotation - 90
      else rotateAmount = currentRotation + 90 >= 360 ? 0 : currentRotation + 90
    }

    if (!checkAngles(rotateAmount)) rotateAmount = 0
    s.transform = rotateAmount ? 'rotate(' + rotateAmount + 'deg)' : ''


    if (rotateAmount === 90 || rotateAmount === 270) {
      if (target.offsetHeight >= window.innerWidth) {
        s.width = 'auto'
        s.height = window.innerWidth + 'px'
      }
    } else {
      s.width = '100%'
      s.height = 'auto'
    }

  }

  function imageCopy(link) {
    const fs = require('fs'),
      request = require('request'),
      image = require('electron').nativeImage

    request.head(link, () => {
      request(uri).pipe(fs.createWriteStream('temp.png')).on('close', () => {
        const i = image.createFromPath('temp.png')
        clipboard.writeImage(i)
        fs.unlink('temp.png')
      })
    });
  }

  function checkAngles(r) {
    return r === 0 || r === 90 || r === 270 || r === 180
  }
}

function goNextIssue() {
  navigation('comic', {link: nextIssue})
}

function goPrevIssue() {
  navigation('comic', {link: previousIssue})
}

function goToIssue(e) {
  navigation('comic', {link: e.target.value})
}

// TODO: Move this to api
function download() {
  loader('start')
  const downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  if (downloadedDB[currentComic.title] && downloadedDB[currentComic.title][currentComic.issue]) return
  downloadComic(currentComic)
}

function showLists(state) {
  const listDiv = qi('lists')
  listDiv.style.height = `${reader.offsetHeight - 62}px`
  if (!listDiv.style.width) listDiv.style.width = '0'

  if (state) qc('addGroup-icons').querySelector('div').style.visibility = state === 'open' ? 'visible' : 'hidden'

  const [ lstyle, ltext, /* rstyle */, gstyle ] =
    qc('addGroup-icons').querySelector('div').style.visibility !== 'hidden'
    ? [ `400px`, 'Hide Lists', 'hidden', 'hidden' ]
    : [ '0', 'Show Lists', 'auto', 'visible']

  listDiv.style.width = lstyle
  qc('addGroup-icons').querySelector('div:nth-of-type(2) > p').innerText = ltext
  // reader.style.overflow = rstyle
  qc('addGroup-icons').querySelector('div').style.visibility = gstyle
}

ipc.on('download', (e, a) => {
  loader('stop')
});

function bgRender(src, preload, listeners, dev = false) {
  // There should never be two hidden webviews
  if (qi('hidden').querySelector('webview')) return
  loaded = false
  if (!listeners['load-commit']) listeners['load-commit'] = loadCommit
  const backgroundWebview = create('webview', {src: src, preload: preload}, listeners)
  hidden.appendChild(backgroundWebview)
  if (dev) backgroundWebview.addEventListener('dom-ready', () => backgroundWebview.openDevTools())
}

// I kept forgetting to do this, so I just made a function for it
// that is easy to remember after every time I create a hidden webview
function clearHidden() {
  loaded = true
  loader('stop')
  clearInterval(iframeTO)
  iframeTO = null
  if (hidden.childNodes.length) {
    hidden.removeChild(q('webview'))
  }
}

function toast(msg) {
  const t = qi('title')

  t.style.display = 'block'
  t.textContent = msg

  setTimeout(() => {
    t.style.display = 'none'
    t.textContent = ''
  }, 2000)
}

function loader(type, dark = false, time = 30) {
  time = time * 1000

  loaderTimeout = l => {
    setTimeout(function() {
      if (l) {
        loader('stop')
        failLoad()
      }
    }, time)
  }

  loaderTimeout()

  function failLoad() {
    const body = q('body')
    const div = create('div', {
      id: 'load-error',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: 'black',
        zIndex: 999,
        color: 'white',
        textAlign: 'center',
        padding: '20px'
      }
    })
    const p = create('p', {style: {display: 'inline', marginRight: '20px'}})
    p.innerText = 'Error with that request.'
    const button = create('button', {type: 'text', style: {display: 'inline'}}, {
      'click': () => {
        console.log('clicking button')
        loader('start', true)
        if (qi('hidden')) qi('hidden').removeChild(qi('hidden').querySelector('webview'))
        mainRender()
        body.removeChild(div)
      }
    })
    button.innerText = 'Reload'
    body.appendChild(div)
    div.appendChild(p)
    div.appendChild(button)
  }
  if (type === 'start') {
    loaderLoading = true
    if (q('.loader')) return
    const loadScreen = dark
      ? create('div', {class: 'loader', style: {backgroundColor: 'black'}}, {'click': e => e.preventDefault()})
      : create('div', {class: 'loader'}, {'click': e => e.preventDefault()})

    const spinner = create('span', {class: ['fab', 'fa-chrome', 'fa-spin', 'fa-10x']})
    loadScreen.appendChild(spinner)
    document.body.appendChild(loadScreen)
  } else if (type === 'stop') {
    loaderLoading = false
    clearTimeout.call(this, loaderTimeout)
    if (!q('.loader')) return
    document.body.removeChild(q('.loader'))
  }
}
