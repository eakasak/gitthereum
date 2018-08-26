const Fetcher = require('./git-fetcher')
const path = require('path')
const { execSync } = require('child_process')
const fetcher = new Fetcher(process.cwd(), {
  env: {
    GNUPGHOME: path.resolve(__dirname, '../keys')
  }
})

let ready = true
async function poll() {
  if (!ready) return
  try {
    ready = false
    console.log(`${new Date().toLocaleTimeString()}\tcalling poll()`)
    console.log('\tfetchAll')
    await fetcher.fetchAll()
    console.log('\tremotes')
    const remotes = await fetcher._listRemotes()
    console.log(remotes)
    console.log('\tchecking master heights')
    result = {}
    const masters = await fetcher.listMasterBranches()
    console.log(masters)
    const getBranchHeight = async branch => {
      const height = await fetcher.getBlockHeightOfBranch(branch)
      return { branch, height }
    }
    const heights = await Promise.all(masters.map(master => getBranchHeight(master)))
    console.log(heights)
    const localMasterBranch = await fetcher.getBlockHeightOfBranch('master')
    const highestBranch = heights.reduce(
      (acc, val) => {
        if (val.height > acc.height) {
          return val
        }
        return acc
      },
      { branch: 'master', height: localMasterBranch }
    )
    console.log(highestBranch)
    if (highestBranch.branch !== 'master') {
      const currentBranch = await fetcher._execGit(`rev-parse --abbrev-ref HEAD`)
      if (currentBranch !== 'master') {
        await fetcher._execGit(`checkout -f master`)
      }
      const [remote, branch] = highestBranch.branch.split('/')
      if (process.env.SAFE == 1) {
        console.log(`SAFE is true, reset ${remote} ${branch} is not executed`)
      } else {
        console.log(`SAFE is not true, actually executing reset ${remote} ${branch}`)
        await fetcher._execGit(`reset --hard ${remote}/${branch}`)
      }
    }
    execSync(`node ${require.resolve('./bin/mine-block')}`, { stdio: 'inherit' })
  } catch (e) {
    console.error('Iteration failed !!')
    throw e
  } finally {
    ready = true
  }
}

const poller = setInterval(poll, process.env.INTERVAL || 10000)

process.on('SIGINT', () => {
  clearInterval(poller)
})
module.exports = poll

poll()
