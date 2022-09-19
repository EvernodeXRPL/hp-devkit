const { execSync } = require('child_process');

function exec(commad, streamOut = false) {
	return execSync(commad, streamOut ? { stdio: 'inherit' } : {stdio : 'pipe' });
}

module.exports = {
	exec
};