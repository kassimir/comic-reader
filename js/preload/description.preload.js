const send = require('../utils').send

window.addEventListener('DOMContentLoaded', onload)


// TODO: Add some level of asynchronousity to this to allow for
// TODO: faster load time of the description box.
function onload() {
  // List of issues
  const issues = document.querySelectorAll('.listing td')

  // The section with the information about the comic
  const about = document.querySelector('.barContent')
  const cover = document.querySelector('#rightside img').src
  const info = about.children[0].querySelectorAll('p')
  const data = {
    'cover': cover,
    'title': about.querySelector('.bigChar').textContent,
    'artist': [],
    'genres': [],
    'publicationdate': '',
    'publisher': [],
    'summary': 'poop',
    'writer': []
  }
  // Gets all the specific data to build the description info
  info.forEach(item => {
    if (!item.children.length && item.textContent) data.summary = item.textContent
    else if (!item.children.length) return
    const children = Array.from(item.children)
    let prop = '';
    children.forEach( (child, ind) => {
      if (child.textContent === 'Status:' || !child.textContent || child.textContent === 'Summary:' || child.textContent === 'Other name:') return
      if (ind === 0) {
        const txt = child.textContent.replace(/[:, \s]/g, '').toLowerCase()
        if (txt !== 'artist' && txt !== 'genres' && txt !== 'publicationdate' && txt !== 'publisher' && txt !== 'writer') return
        prop = txt
      }
      else if (child.nodeName === 'A') if (data[prop]) data[prop].push(child.textContent); else return
      if (prop === 'publicationdate') data['publicationdate'] = child.nextSibling.textContent.trim()
    })
  })

  // This gets the issues.
  const issueList = {}

  issues.forEach( (issue, ind) => {
    if (issue.children.length && issue.children[0].nodeName === 'A') issueList[issue.children[0].textContent.trim()] = issue.children[0].href
  })
  send ({desc: data, issues: issueList})
}
