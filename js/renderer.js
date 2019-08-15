const utils = require('./js/utils.js')
const {
  qi,
  q,
  qc,
  create,
  readDB,
  rewriteDB,
  getGroups,
  createGroup,
  deleteGroupDB,
  sortIssues,
  writeRecent,
  writeToDB,
  updateDB,
  deleteFromDB,
  downloadComic
} = utils
const getIssue = utils.getOrRemoveIssue
const Tile = require('./js/models/tile.model')
const fs = require('fs')
const ipc = require('electron').ipcRenderer

// Hidden div for rendering pages in the background
const hidden = qi('hidden')
// Reader div for actually displaying data
const reader = qi('reader')
// Variable for the loader failsafe (failLoad)
let loaderLoading, loaderTimeout

if (!navigator.onLine) {
  // Go to download mode
  q('.section-title').forEach(i => i.style.display = 'none')
  q('.carousel-outer').forEach(i => i.style.display = 'none')
  q('.downloaded').forEach(i => i.style.display = 'flex')
  const downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  Object.keys(downloadedDB).forEach(key => {
    buildTile(new Tile(key, `downloads/${key}/cover.jpg`, null), `downloaded`)
  })
} else {
  loader('start', true)
  window.onload = mainRender
}


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
  link: '',
  issue: ''
}


// After creating groups, it was going to become very expensive to
// check every issue for being in a group, so I'm creating an array
// of issue titles instead and a correlating list of what group it's in.
let GROUPS = getGroups(), GROUP_ISSUE_ARRAY = []

// INSERTING SMALL PATCH FOR BACKWARDS COMPATIBILITY
// After getting db's, check to see if they need date/position update
let recentDB, readingDB

// This is the database for the Reading List
if (fs.existsSync('./database/reading.database.json')) {
  readingDB = JSON.parse(fs.readFileSync('./database/reading.database.json').toString())
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


let descNode, issueNode, groupsNode, iframeTO, loaded = false

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

  readingDB = JSON.parse(fs.readFileSync('./database/reading.database.json').toString())
  recentDB = JSON.parse(fs.readFileSync('./database/recent.database.json').toString())

  // Hide the Home and download button, if it is showing
  if (qi('home-download').style.visibility === 'visible') rebuild()

  function ipcMessage(e) {
    switch (e.channel) {
      case 'msg':
        console.log(e.args[0]);
        break
      case 'tab-newest':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-day':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-week':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-month':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-mostview':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'latest':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
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
      return new Date(recentDB[b].date) - new Date(recentDB[a].date)
    })

    sortedRecent.forEach( c => {
      const comic = new Object(recentDB[c])
      buildTile(new Tile(c, comic.cover, comic.link), 'recent')
    })
  } else qi('recent-text').style.display = 'none'

  // Reading List
  // I should really get rid of this, but I'm leaving it for backwards compatibility.
  // Once all comics are removed from here, it will disappear anyway, so no harm no foul
  if (Object.keys(readingDB).length) {
    qi('recent-text').style.display = 'flex'
    qi('reading').style.display = 'flex'
    const sortedReading = Object.keys(readingDB).sort((a, b) => {
      return readingDB[b].position - readingDB[a].position
    })

    sortedReading.forEach( c => {
      const comic = readingDB[c]
      GROUP_ISSUE_ARRAY.push({title: c, db: 'reading'})
      buildTile(new Tile(c, comic.cover, comic.link), 'reading', null, comic.position)
    })
  } else {
    qi('reading').style.display = 'none'
    qi('reading-text').style.display = 'none'
  }

  // Build Groups
  buildGroups()

  function rebuild() {
    loader('start', true)
    qi('home-download').style.visibility = 'hidden'
    if (qi('comic')) document.body.removeChild(qi('comic'))
    q('#recent .carousel-inner').innerHTML = ''
    q('#reading .carousel-inner').innerHTML = ''
    q('#latest .carousel-inner').innerHTML = ''
    q('#newest .carousel-inner').innerHTML = ''
    q('#topday .carousel-inner').innerHTML = ''
    q('#topmonth .carousel-inner').innerHTML = ''
    q('#topweek .carousel-inner').innerHTML = ''
    q('#mostview .carousel-inner').innerHTML = ''
    q('#recent-desc').innerHTML = ''
    q('#reading-desc').innerHTML = ''
    q('#latest-desc').innerHTML = ''
    q('#newest-desc').innerHTML = ''
    q('#topday-desc').innerHTML = ''
    q('#topmonth-desc').innerHTML = ''
    q('#topweek-desc').innerHTML = ''
    q('#mostview-desc').innerHTML = ''
    q('#search-results').innerHTML = ''
    q('#search-desc').innerHTML = ''
    q('#paginate').style.display = 'none'
    q('#search').style.display = 'block'
    q('#title').textContent = ''
    q('#title').style.display = 'none'
  }
}

function buildTile(tile, section, first, position = 0) {
  const sect = section.replace(/(tab|-)/g, '')
  const comicDiv = qi(`${sect}`).querySelector('.carousel-inner')

  const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}, class: 'carousel-container', 'data-position': position})
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

  container.appendChild(img)
  container.appendChild(title)

  if (!defaultSection(sect)) {
    const arrowDiv = create('div', {
      style: {width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', overflow: 'hidden'},
      class: `${sect}-arrows`
    })
    const left = create('span', {class: ['fas', 'fa-arrow-circle-left'], 'data-position': position}, {'click':  function() {moveComic('l', sect, container)}})
    const right = create('span', {class: ['fas', 'fa-arrow-circle-right'], 'data-position': position}, {'click': function() {moveComic('r', sect, container)}})

    arrowDiv.appendChild(left)
    arrowDiv.appendChild(right)
    container.appendChild(arrowDiv)
  }

  if (first) comicDiv.insertBefore(container, comicDiv.children[0])
  else comicDiv.appendChild(container)

  // The page will often send 503 errors for the images, so
  // this will keep trying to load it until it doesn't error
  // Obviously, there's no failsafe here, so if there's a
  // legitimate error (like a 404), it will try into oblivion
  // TODO: Set a default image after x amount of tries
  function onerr(e) {
    setTimeout(() => e.target.src = e.target.currentSrc, 2000)
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
  if (!GROUPS.length) return

  if (add) {
    buildSection(add.group)
    return
  }

  GROUPS.forEach( group => {
    if (!group.hasOwnProperty('sectionID') || !group.hasOwnProperty('sectionTitle')) return

    buildSection(group)

    const database = readDB(group.sectionID)
    const sortedDB = Object.keys(database).sort((a, b) => {
      return database[b].position - database[a].position
    })

    sortedDB.forEach( c => {
      const comic = database[c]
      GROUP_ISSUE_ARRAY.push({title: c, db: group.sectionTitle})
      buildTile(new Tile(c, comic.cover, comic.link),  group.sectionID, false, comic.position)
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
    menuIconsContainer.appendChild(menuIcon1)
    menuIconsContainer.appendChild(menuIcon2)
    menuIconsContainer.appendChild(menuIcon3)
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
          deleteMenu.appendChild(sure)
          deleteMenu.appendChild(yes)
          deleteMenu.appendChild(slash)
          deleteMenu.appendChild(no)
      titleMenu.appendChild(reverseIcon)
      titleMenu.appendChild(changeOrderIcon)
      titleMenu.appendChild(deleteGroupIcon)
      titleMenu.appendChild(deleteMenu)
    titleMenuContainer.appendChild(titleMenu)
    // Carousel
    const carouselOuter = create('div', {class: 'carousel-outer', id: group.sectionID})
      const carouselInner = create('div', {class: 'carousel-inner'})
    carouselOuter.appendChild(carouselInner)
    // Description
    const desc = create('div', {class: 'section-desc', id: `${group.sectionID}-desc`})

    mainDiv.appendChild(sectionText)
    mainDiv.appendChild(menuIconsContainer)
    mainDiv.appendChild(titleMenuContainer)

    reader.insertBefore(desc, reader.children[6])
    reader.insertBefore(carouselOuter, reader.children[6])
    reader.insertBefore(mainDiv, reader.children[6])
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
  setTimeout(() => GROUPS = getGroups(), 1000)
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
    const info = create('div', {style: {width: '35%', display: 'flex', flexDirection: 'column'}})
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
  if (evt.section !== 'search') scrollSection(qi(`${evt.section}`))

  const descId = `${evt.section}-desc`
  const comicLink = evt.link
  const issueFragment = document.createDocumentFragment()
  const descFragment = document.createDocumentFragment()
  const groupFragment = document.createDocumentFragment()
  const view = evt.view ? evt.view : 'i'

  let desc, comicTitle
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
    const title = create('p', {textContent: descArgs.title, style: {width: '34%'}})
    // Contains 'Add to/Remove from Reading List' and 'Show Issues/Description'
    const optionsContainer = create('div', {
      'style': {display: 'flex', flexDirection: 'row', width: '33%'},
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
    // Div to house the 'X' to close description/issues
    const closeDescription = create('div', {
      style: {
        textAlign: 'right',
        width: '33%'
      }
    }, {'click': () => desc.innerHTML = ''})
    // 'X' to close description/issues
    const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '20px'}})
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

    optionsContainer.appendChild(descReadIcon)
    optionsContainer.appendChild(listIssues)
    optionsContainer.appendChild(descIssuesIcon)
    optionsContainer.appendChild(showDescription)
    closeDescription.appendChild(closeDesc)
    titleHeader.appendChild(optionsContainer)
    titleHeader.appendChild(title)
    titleHeader.appendChild(closeDescription)

    // Description
    const descContainer = create('div', {class: 'desc-info'})
    const info = create('div', {style: {width: '35%', display: 'flex', flexDirection: 'column'}})
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

    sortedIssuesArray.forEach(i => {
      let spanClass = 'link'
      if (recentDB[comicTitle] && recentDB[comicTitle].issues[getIssue(i, 'issue')]) spanClass = 'link-read'
      const a = create('span', {textContent: i, 'data-link': ishArgs[i], class: spanClass})
      issueContainer.appendChild(a)
    })

    issueFragment.appendChild(issueContainer)
    issueNode = issueFragment.cloneNode(true)

    desc.appendChild(issueFragment)

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

    groupFragment.appendChild(groupContainer)
    groupsNode = groupFragment.cloneNode(true)

    desc.appendChild(groupFragment)

    toggleView(view)

    function onclick(e) {
      currentComic.title = comicTitle
      currentComic.cover = comicCover
      currentComic.link = comicLink
      navigation('comic', {title: comicTitle, issue: e.target.textContent, link: e.target.dataset.link})
    }

    function toggleView(v) {
      if (v === 'i') {
        descContainer.style.display = 'none'
        descReadIcon.style.display = 'none'
        listIssues.style.display = 'none'

        groupContainer.style.display = 'none'

        issueContainer.style.display = 'block'
        descIssuesIcon.style.display = 'block'
        showDescription.style.display = 'block'
      } else if (v === 'd') {
        descContainer.style.display = 'flex'
        descReadIcon.style.display = 'block'
        listIssues.style.display = 'block'

        groupContainer.style.display = 'none'

        issueContainer.style.display = 'none'
        descIssuesIcon.style.display = 'none'
        showDescription.style.display = 'none'
      } else if (v === 'g') {
        descContainer.style.display = 'none'
        descReadIcon.style.display = 'block'
        listIssues.style.display = 'block'

        groupContainer.style.display = 'block'

        issueContainer.style.display = 'none'
        descIssuesIcon.style.display = 'block'
        showDescription.style.display = 'block'
      }
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
    buildTile(new Tile(comicTitle, comicCover, comicLink), `${section}`, true, position)
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

function mdInput(e) {
  if ( (e.keyCode || e.which) === 13) addGroup()
}

function showAddGroup() {
  const container = qc('addGroup-groupName_container')
  const plus = qc('addGroup-icons').querySelector('.fa-plus')
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
  if (!sectionTitle) return
  showAddGroup()
  let sectionID = ''
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

  for (let i = 0; i < 7; i++)
    sectionID += possible.charAt(Math.floor(Math.random() * possible.length))

  let uniqueID = true

  for (let prop in GROUPS) {
    if (!GROUPS.hasOwnProperty(prop)) return

    if (GROUPS[prop].sectionID === sectionID) uniqueID = false
  }

  if (!uniqueID) return addGroup()

  createGroup(sectionID, sectionTitle)
  GROUPS.push({sectionID, sectionTitle})
  buildGroups({group: {sectionID, sectionTitle}})
  toast('Group Successfully Added!')
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

function buildComic(e) {
  loader('start', false, 300)
  // Save to Recently Read database
  // Set up Home and download button

  qi('home-download').style.visibility = 'visible'

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
  const comicLink = e.link

  function ipcMessage(e) {
    if (e.channel === 'msg') {
      console.log(e.args[0])
      return
    }
    clearHidden()

    let comicPanel, comicDiv

    if (!q('#comic')) {
      comicPanel = create('div', {class: 'reader-view', id: 'comic', style: {zIndex: '2'}})
      comicDiv = create('div', {
        style: {
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexDirection: 'column'
        }
      })
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

    function rightClickImage(e) {
      const menu = qi('rotate-menu')
      if (menu) q('body').removeChild(menu)

      if (e.which === 3) rightClickMenu({target: e.target, x: e.clientX, y: e.clientY})
    }
  }

  bgRender(e.link + '&readType=1', './js/preload/comic.preload.js', {'ipc-message': ipcMessage})
}

function rightClickMenu(coords = {target: null, x: 0, y: 0}) {
  const { target, x, y } = coords
  const div = create('div', {
    style: {
      position: 'absolute',
      left: x + 'px',
      top: y + 'px',
      width: '85px',
      height: '38px',
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
      fontSize: '12px',
      margin: 0,
      paddingTop: '1px'
  }}, {'click': () => rotate('r')})
  left.innerText = 'Rotate Left'
  right.innerText = 'Rotate Right'
  div.appendChild(left)
  div.appendChild(right)
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
      console.log('elsing')
      s.width = '100%'
      s.height = 'auto'
    }

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

function download() {
  loader('start')
  const downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  if (downloadedDB[currentComic.title] && downloadedDB[currentComic.title][currentComic.issue]) return
  downloadComic(currentComic)
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
