const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Schema
const licenseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    serverId: { type: String, required: true },
    owner: { type: String, required: true },
    hwid: { type: String, default: null },
    active: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const License = mongoose.model('License', licenseSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB error:', err));

// === ENDPOINTS ===

// 1. Verify License (plugin sprawdza)
app.post('/api/verify', async (req, res) => {
    try {
        const { key, serverId, hwid } = req.body;
        
        if (!key || !serverId || !hwid) {
            return res.json({ success: false, message: 'Brak wymaganych danych' });
        }

        const license = await License.findOne({ key });
        
        if (!license) {
            return res.json({ success: false, message: 'Nieprawid³owy klucz licencji' });
        }

        if (!license.active) {
            return res.json({ success: false, message: 'Licencja nieaktywna' });
        }

        if (license.serverId !== serverId) {
            return res.json({ success: false, message: 'Licencja przypisana do innego serwera' });
        }

        // First time activation - bind HWID
        if (!license.hwid) {
            license.hwid = hwid;
            await license.save();
            return res.json({ success: true, message: 'Licencja aktywowana' });
        }

        // Check HWID match
        if (license.hwid !== hwid) {
            return res.json({ success: false, message: 'HWID nie pasuje - licencja przypisana do innego serwera' });
        }

        res.json({ success: true, message: 'Licencja wa¿na' });
    } catch (error) {
        res.json({ success: false, message: 'B³¹d serwera: ' + error.message });
    }
});

// 2. Add License (panel)
app.post('/api/add', async (req, res) => {
    try {
        const { key, serverId, owner } = req.body;
        
        if (!key || !serverId || !owner) {
            return res.json({ success: false, message: 'Wype³nij wszystkie pola' });
        }

        const exists = await License.findOne({ key });
        if (exists) {
            return res.json({ success: false, message: 'Klucz ju¿ istnieje' });
        }

        const license = new License({ key, serverId, owner, active: true });
        await license.save();

        res.json({ success: true, message: 'Licencja dodana' });
    } catch (error) {
        res.json({ success: false, message: 'B³¹d: ' + error.message });
    }
});

// 3. Check License (panel)
app.post('/api/check', async (req, res) => {
    try {
        const { key, serverId } = req.body;
        
        if (!key || !serverId) {
            return res.json({ success: false, message: 'Wype³nij wszystkie pola' });
        }

        const license = await License.findOne({ key, serverId });
        
        if (!license) {
            return res.json({ success: false, message: 'Nie znaleziono licencji' });
        }

        res.json({
            success: true,
            data: {
                key: license.key,
                serverId: license.serverId,
                owner: license.owner,
                hwid: license.hwid || 'Nie przypisany',
                active: license.active,
                createdAt: license.createdAt
            }
        });
    } catch (error) {
        res.json({ success: false, message: 'B³¹d: ' + error.message });
    }
});

// 4. Manage License (panel - activate/deactivate)
app.post('/api/manage', async (req, res) => {
    try {
        const { key, action, reason } = req.body;
        
        if (!key || !action) {
            return res.json({ success: false, message: 'Brak wymaganych danych' });
        }

        const license = await License.findOne({ key });
        
        if (!license) {
            return res.json({ success: false, message: 'Nie znaleziono licencji' });
        }

        if (action === 'activate') {
            license.active = true;
        } else if (action === 'deactivate') {
            license.active = false;
        } else if (action === 'reset-hwid') {
            license.hwid = null;
        }

        await license.save();

        res.json({ success: true, message: 'Licencja zaktualizowana' });
    } catch (error) {
        res.json({ success: false, message: 'B³¹d: ' + error.message });
    }
});

// 5. List All Licenses
app.get('/api/list', async (req, res) => {
    try {
        const licenses = await License.find().select('-__v').sort({ createdAt: -1 });
        res.json({ success: true, data: licenses });
    } catch (error) {
        res.json({ success: false, message: 'B³¹d: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`License API running on port ${PORT}`);
});
```

**3. .env**
```
mongodb+srv://pandziol_:PJmaiMTV4DQn23oo@astpvp-licenses.asaunxo.mongodb.net/?appName=astpvp-licenses 

PORT=3000
