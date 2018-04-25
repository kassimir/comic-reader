const ipcRender = require('electron').ipcRenderer
const ipcMain = require('electron').ipcMain

/*
  I don't want to use jQuery, but I also hate writing document.querySelector[All](element)
   a million times, so I wrote my own selector functions.
 */

const q = ele => document.querySelectorAll(ele).length > 1 ? document.querySelectorAll(ele) : document.querySelector(ele)
const qi = (id) => document.getElementById(id)
const qc = cls => document.getElementsByClassName(cls)

/*
  I do a lot of element creation, so this shortens it.
  ele = element to create
  attrs = any attributes to add to the element in object format
    most typical style elements like {style: {width: '100px'}}
    and the id of the element
  listeners = any event listeners to add. also in object form
    example: {'console-message': (e)=>console.log(e.message)
 */

const create = (ele, attrs, listeners) => {
  // create element
  const e = document.createElement(ele)
  // add any attributes
  if (attrs) {
    for (let key in attrs) {
      if (attrs.hasOwnProperty(key)) {
        if (typeof attrs[key] === 'object' && !Array.isArray(attrs[key])) {
          for (let k in attrs[key]) {
            e[key][k] = attrs[key][k]
          }
        } else {
          if (key === 'class') {
            if (Array.isArray(attrs[key])) attrs[key].forEach( c => e.classList.add(c))
            else e.classList.add(attrs[key])
          }
          else if (key.includes('data')) e.setAttribute(key, attrs[key])
          else e[key] = attrs[key]
        }
      }
    }
  }
  // add any event listeners
  if (listeners) {
    for (let l in listeners) {
      if (listeners.hasOwnProperty(l)) e.addEventListener(l, listeners[l])
    }
  }
  return e
}

/* ipc messaging shortcuts
 There is a LOT of messaging in this app
 so I shortened it to make it less keystrokes
  msg = message to send
  channel = channel to use
  type = 'r' for ipcRender.send,
         'h' for ipcRender.sendToHost or
         else ipcMain.send()
 */
const send = (msg, channel = 'default', type = 'h') => {
  if (type === 'h') ipcRender.sendToHost(channel, msg)
  else if (type === 'r') ipcRender.send(channel, msg)
  else ipcMain.send(channel, msg)
}


// This gets rid of the Issue from the text
// A lot of times the text is something like
// Batman Issue #51. This removes the issue
// and grabs the title of the comic itself
function getOrRemoveIssue(txt, type) {
  const split = txt.split(' ')
  if (split.length < 2) return txt

  function nameCheck(name) {
    return ['Issue', 'Full', 'TPB', 'Special', '_Special', 'Annual', '_Annual', 'Yearbook'].filter( p => name.includes(p))
  }

  const last = split[split.length - 1]
  const secondLast = split[split.length - 2]
  // I haven't seen it, but if there is something titled Deadpool TPB Vol 2. This
  // will return 2 for the number and Vol 2 for the issue and Deadpool TPB for the
  // title, so something to watch out for, but until I find it, I'm not changing it. :)

  if (type === 'number') return last
  else if (type === 'issue') {
    // If the issue is a word (Full, TPB, etc) it will not parseInt
    // Same as if it has # in it
    if (!parseInt(last)) {
      // check if it is #[issue]
      if (last[0] === '#' || nameCheck(secondLast)) return secondLast + ' ' + last
      // if it isn't, then it's a word of some kind (Full, TPB, etc)
      return last
    } else {
      if (nameCheck(secondLast)) return secondLast + ' ' + last
      return last
    }
  } else if (type === 'name') {
    // If it has #[issue], it's probably preceeded by "Issue"
    // I've also seen Issue [issue] without a # sign, so same scenario, really
    // Note that if something is titled Title TPB 1, it will return Title TPB
    // but I've never seen that, so . . . something to watch out for
    if ( (last[0] === '#' && nameCheck(secondLast)) || (parseInt(last) && nameCheck(secondLast)) ) return split.pop() && split.pop() && split.join(' ')
    // Just in case it isn't preceeded "Issue" however . . .
    else if ( (last[0] === '#' && !nameCheck(secondLast))
      || (parseInt(last) && !nameCheck(secondLast))
      // Lastly, if there's an issue number but no # and no "Issue"
      || (!parseInt(last)) )
        return split.pop() && split.join(' ')
  }
}

function sortIssues(arr) {
  // TODO: write a function that sorts the issues in a not stupid way
  if (arr.length < 2) return arr

  const sortedArr = []
  // This code will find out what types of issues a comic has: Issues, TPB, Annual, etc
  // That way you don't get Issue #1, Annual 1, Issue #2. It will be Issue #1, Issue #2, Annual 1
  // Note that "Issue"s are first-class citizens here.
  const issueTypes = new Set(arr.map( i => getOrRemoveIssue(i, 'issue'))
    .map( i => {
      const ish = i.split(' ')
      return ish[0]
    }))

  function mySort(a, type) {
    return a.filter( i => i.includes(type)).sort( (a,b) => {
      let first = getOrRemoveIssue(a, 'number')
      let second = getOrRemoveIssue(b, 'number')
      if (first[0] === '#') first = first.substr(1, first.length - 1)
      if (second[0] === '#') second = second.substr(1, second.length - 1)
      return first - second
    })
  }

  if (issueTypes.has('Issue')) {
    const issueArr = mySort(arr, 'Issue');

    issueArr.forEach( i => sortedArr.push(i))
  }

  issueTypes.delete('Issue')
  if (issueTypes.size) {
    issueTypes.forEach( type => {
      const issueArr = mySort(arr, type);

      issueArr.forEach( i => sortedArr.push(i))
    })
  }

  return sortedArr
}

function writeRecent(comic, issue, link) {
  const recentDB = require('../database/recent.database')
  issue = getOrRemoveIssue(issue, 'issue')
  if (!recentDB[comic.title]) recentDB[comic.title] = {link: comic.link, cover: comic.cover, issues: {[issue] : link}}
  else recentDB[comic.title].issues[issue] = link
  send({type: 'recent', data: recentDB}, 'update', 'r')
}

module.exports = {
  q: q,
  qi: qi,
  qc: qc,
  send: send,
  create: create,
  getOrRemoveIssue: getOrRemoveIssue,
  sortIssues: sortIssues,
  writeRecent: writeRecent
}