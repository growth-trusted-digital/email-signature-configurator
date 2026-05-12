export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
        return res.status(204).end();
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    const password = req.headers['x-admin-password'];
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        return res.status(500).json({ error: 'GITHUB_TOKEN env var missing' });
    }

    const repo = process.env.GITHUB_REPO || 'growth-trusted-digital/email-signature-configurator';
    const path = process.env.GITHUB_PATH || 'index.html';

    const data = req.body || {};

    try {
        const fileRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'sig-defaults-publisher'
            }
        });
        if (!fileRes.ok) {
            const detail = await fileRes.text();
            return res.status(500).json({ error: 'github get failed', status: fileRes.status, detail });
        }
        const file = await fileRes.json();
        const sha = file.sha;
        let html = Buffer.from(file.content, 'base64').toString('utf8');

        const fieldMap = {
            name: 'input-name',
            role: 'input-role',
            phone: 'input-phone',
            email: 'input-email',
            photo: 'input-photo',
            logo: 'input-logo',
            bgPattern: 'input-bg-pattern',
            phoneIcon: 'input-phone-icon',
            emailIcon: 'input-email-icon',
            webIcon: 'input-web-icon',
            locationIcon: 'input-location-icon',
            facebookIcon: 'input-facebook-icon',
            instagramIcon: 'input-instagram-icon',
            xIcon: 'input-x-icon',
            linkedinIcon: 'input-linkedin-icon',
            facebookUrl: 'input-facebook-url',
            instagramUrl: 'input-instagram-url',
            xUrl: 'input-x-url',
            linkedinUrl: 'input-linkedin-url'
        };

        Object.entries(fieldMap).forEach(([k, id]) => {
            if (typeof data[k] === 'string') {
                const escaped = data[k].replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                const re = new RegExp(`(id="${id}"[^>]*?value=")[^"]*(")`);
                html = html.replace(re, `$1${escaped}$2`);
            }
        });

        const toggleKeys = ['photo','phone','email','website','location','facebook','instagram','x','linkedin','sidebar'];
        if (data.toggles && typeof data.toggles === 'object') {
            toggleKeys.forEach(k => {
                if (typeof data.toggles[k] === 'boolean') {
                    const wantChecked = data.toggles[k];
                    const re = new RegExp(`(<input type="checkbox" id="toggle-${k}")(\\s+checked)?`);
                    html = html.replace(re, `$1${wantChecked ? ' checked' : ''}`);
                }
            });
        }

        const newContent = Buffer.from(html, 'utf8').toString('base64');
        const commitRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'User-Agent': 'sig-defaults-publisher'
            },
            body: JSON.stringify({
                message: 'Update signature defaults via dialog',
                content: newContent,
                sha
            })
        });
        const commit = await commitRes.json();
        if (!commitRes.ok) {
            return res.status(500).json({ error: 'commit failed', detail: commit });
        }

        return res.status(200).json({
            ok: true,
            commit: commit.commit && commit.commit.html_url
        });
    } catch (err) {
        return res.status(500).json({ error: 'unexpected', message: String(err && err.message || err) });
    }
}
