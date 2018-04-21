const send = require('../utils').send

let int

window.onload = () => {int = setInterval(onload, 2000)}

function onload() {
  // For some reason, I couldn't use document.querySelectorAll('.listing td')
  // It was ALWAYS null. Which is annoying. So I had to go this route instead.
  const issues = document.querySelector('.listing').children[0].children

  // The section with the information about the comic
  const about = document.querySelector('.barContent')

  // Mmmmm... recursion
  if (!issues.innerHTML || !about.innerHTML) setTimeout(onload, 2000)

  const info = about.children[0].querySelectorAll('p')
  const data = {
    'title': about.querySelector('.bigChar').textContent,
    'artist': [],
    'genres': [],
    'publicationdate': '',
    'publisher': [],
    'summary': 'poop',
    'writer': []
  }
  // If they ever change their site, this whole thing is screwed
  // Gets all the specific data to build the description info
  info.forEach(item => {
    if (!item.children.length && item.textContent) data.summary = item.textContent
    else if (!item.children.length) return
    const children = Array.from(item.children)
    let prop = '';
    children.forEach( (child, ind) => {
      if (child.textContent === 'Status:' || !child.textContent || child.textContent === 'Summary:') return
      if (ind === 0) prop = child.textContent.replace(/[:, \s]/g, '').toLowerCase()
      else if (child.nodeName === 'A') data[prop].push(child.textContent)
      if (prop === 'publicationdate') data['publicationdate'] = child.nextSibling.textContent.trim()
    })
  })

  // This gets the issues. This was a separate step, but it takes
  // such a small amount of time compared to having to load up
  // another webview for the issue list, that I decided to combine
  // the two steps into one. It lags the load of the description a
  // little bit but allows for easy back-and-forth between the
  // description and list of issues.
  const issueList = {}

  Array.from(issues).forEach( (issue, ind) => {
    // This is "Issue Name" and "Day Added." I don't care about those
    // I decided to remove "Day Added" altogether, because I don't care
    // Currently this works, but I haven't tested with enough comics yet
    // There may be one with "Day Added" that throws off my every-other-one
    // approach here.
    if (ind < 2) return

    // I absolutely hate how I get the links here, but because my initial
    // document.querySelectorAll('.listing td') doesn't work, this is what
    // I ended up with. I will probably revisit this to find a better way.
    let td, a
    if (issue.children.length)  td = issue.children[0]
    if (td && td.children.length)  a = td.children[0]
    if (a && a.nodeName === 'A') issueList[a.textContent] = a.href
  })
  send ({desc: data, issues: issueList})
}
