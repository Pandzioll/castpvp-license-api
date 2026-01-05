const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
require('dotenv').config();

const app = express();
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'twoj-super-tajny-klucz-zmien-to',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24h
}));

// MongoDB Schemas
const licenseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    serverId: { type: String, required: true },
    owner: { type: String, required: true },
    hwid: { type: String, default: null },
    active: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const License = mongoose.model('License', licenseSchema);
const Admin = mongoose.model('Admin', adminSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB error:', err));

// Middleware do sprawdzania logowania
const requireAuth = (req, res, next) => {
    if (req.session && req.session.adminId) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Brak autoryzacji' });
    }
};

// === ADMIN ENDPOINTS ===

// Rejestracja admina (użyj TYLKO RAZ, potem możesz usunąć ten endpoint)
app.post('/api/admin/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Sprawdź czy już istnieje admin
        const existingAdmin = await Admin.findOne();
        if (existingAdmin) {
            return res.json({ success: false, message: 'Admin już istnieje' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = new Admin({ username, password: hashedPassword });
        await admin.save();

        res.json({ success: true, message: 'Admin utworzony' });
    } catch (error) {
        res.json({ success: false, message: 'Błąd: ' + error.message });
    }
});

// Logowanie
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.json({ success: false, message: 'Nieprawidłowe dane' });
        }

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.json({ success: false, message: 'Nieprawidłowe dane' });
        }

        req.session.adminId = admin._id;
        res.json({ success: true, message: 'Zalogowano' });
    } catch (error) {
        res.json({ success: false, message: 'Błąd: ' + error.message });
    }
});

// Wylogowanie
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Wylogowano' });
});

// Sprawdź czy zalogowany
app.get('/api/admin/check', (req, res) => {
    if (req.session && req.session.adminId) {
        res.json({ success: true, loggedIn: true });
    } else {
        res.json({ success: false, loggedIn: false });
    }
});

// === LICENSE ENDPOINTS (dla pluginu) ===

// 1. Verify License (plugin sprawdza - BEZ AUTORYZACJI)
app.post('/api/verify', async (req, res) => {
    try {
        const { key, serverId, hwid } = req.body;
        
        if (!key || !serverId || !hwid) {
            return res.json({ success: false, message: 'Brak wymaganych danych' });
        }

        const license = await License.findOne({ key });
        
        if (!license) {
            return res.json({ success: false, message: 'Nieprawidłowy klucz licencji' });
        }

        if (!license.active) {
            return res.json({ success: false, message: 'Licencja nieaktywna' });
        }

        if (license.serverId !== serverId) {
            return res.json({ success: false, message: 'Licencja przypisana do innego serwera' });
        }

        if (!license.hwid) {
            license.hwid = hwid;
            await license.save();
            return res.json({ success: true, message: 'Licencja aktywowana' });
        }

        if (license.hwid !== hwid) {
            return res.json({ success: false, message: 'HWID nie pasuje' });
        }

        res.json({ success: true, message: 'Licencja ważna' });
    } catch (error) {
        res.json({ success: false, message: 'Błąd serwera: ' + error.message });
    }
});

// === PANEL ENDPOINTS (wymagają autoryzacji) ===

// 2. Add License
app.post('/api/add', requireAuth, async (req, res) => {
    try {
        const { key, serverId, owner } = req.body;
        
        if (!key || !serverId || !owner) {
            return res.json({ success: false, message: 'Wypełnij wszystkie pola' });
        }

        const exists = await License.findOne({ key });
        if (exists) {
            return res.json({ success: false, message: 'Klucz już istnieje' });
        }

        const license = new License({ key, serverId, owner, active: true });
        await license.save();

        res.json({ success: true, message: 'Licencja dodana' });
    } catch (error) {
        res.json({ success: false, message: 'Błąd: ' + error.message });
    }
});

// 3. Check License
app.post('/api/check', requireAuth, async (req, res) => {
    try {
        const { key, serverId } = req.body;
        
        if (!key || !serverId) {
            return res.json({ success: false, message: 'Wypełnij wszystkie pola' });
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
        res.json({ success: false, message: 'Błąd: ' + error.message });
    }
});

// 4. Manage License
app.post('/api/manage', requireAuth, async (req, res) => {
    try {
        const { key, action } = req.body;
        
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
        res.json({ success: false, message: 'Błąd: ' + error.message });
    }
});

// 5. List All Licenses
app.get('/api/list', requireAuth, async (req, res) => {
    try {
        const licenses = await License.find().select('-__v').sort({ createdAt: -1 });
        res.json({ success: true, data: licenses });
    } catch (error) {
        res.json({ success: false, message: 'Błąd: ' + error.message });
    }
});

// 6. Delete License
app.post('/api/delete', requireAuth, async (req, res) => {
    try {
        const { key } = req.body;
        
        const result = await License.deleteOne({ key });
        
        if (result.deletedCount === 0) {
            return res.json({ success: false, message: 'Nie znaleziono licencji' });
        }

        res.json({ success: true, message: 'Licencja usunięta' });
    } catch (error) {
        res.json({ success: false, message: 'Błąd: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`License API running on port ${PORT}`);
});
