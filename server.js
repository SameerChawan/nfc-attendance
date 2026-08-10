require('dotenv').config();
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// File upload
const upload = multer({ dest: 'uploads/' });

// Supabase helper
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabaseQuery(table, method = 'GET', data = null, params = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    
    if (method === 'GET' && Object.keys(params).length > 0) {
        const query = new URLSearchParams(params).toString();
        url += `?${query}`;
    }

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : undefined
    };

    // Remove undefined headers
    Object.keys(headers).forEach(key => headers[key] === undefined && delete headers[key]);

    const options = { method, headers };
    if (data && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Supabase error: ${response.status} - ${error}`);
    }

    return response.json();
}

// ==================== COMPETITIONS ====================

// Create competition
app.post('/api/competition', async (req, res) => {
    try {
        const { competition_id, name, date, location, events } = req.body;
        
        const result = await supabaseQuery('nfc_competitions', 'POST', {
            competition_id,
            name,
            date,
            location,
            events: events || [],
            active: true
        });

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List competitions
app.get('/api/competitions', async (req, res) => {
    try {
        const result = await supabaseQuery('nfc_competitions', 'GET', null, {
            'order': 'created_at.desc'
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get competition details
app.get('/api/competition/:id', async (req, res) => {
    try {
        const result = await supabaseQuery('nfc_competitions', 'GET', null, {
            'competition_id': `eq.${req.params.id}`
        });
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Competition not found' });
        }

        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update competition
app.patch('/api/competition/:id', async (req, res) => {
    try {
        const result = await supabaseQuery('nfc_competitions', 'PATCH', req.body, {
            'competition_id': `eq.${req.params.id}`
        });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== COMPETITORS ====================

// Add competitor manually
app.post('/api/competitor', async (req, res) => {
    try {
        const { competition_id, wca_id, name, email, phone } = req.body;
        
        const is_new = !wca_id;
        let temp_id = null;
        
        if (is_new) {
            // Generate TEMP-XXX
            const existing = await supabaseQuery('nfc_competitors', 'GET', null, {
                'competition_id': `eq.${competition_id}`,
                'is_new': 'eq.true',
                'select': 'temp_id',
                'order': 'temp_id.desc',
                'limit': '1'
            });
            
            if (existing.length > 0) {
                const lastNum = parseInt(existing[0].temp_id.split('-')[1]);
                temp_id = `TEMP-${String(lastNum + 1).padStart(3, '0')}`;
            } else {
                temp_id = 'TEMP-001';
            }
        }

        const result = await supabaseQuery('nfc_competitors', 'POST', {
            competition_id,
            wca_id: wca_id || null,
            name,
            email,
            phone,
            is_new,
            temp_id
        });

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload competitors CSV
app.post('/api/competitors/csv', upload.single('file'), async (req, res) => {
    try {
        const competition_id = req.body.competition_id;
        const results = [];
        const errors = [];

        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (row) => results.push(row))
            .on('end', async () => {
                let tempCounter = 0;
                
                // Get existing temp IDs
                const existing = await supabaseQuery('nfc_competitors', 'GET', null, {
                    'competition_id': `eq.${competition_id}`,
                    'is_new': 'eq.true',
                    'select': 'temp_id',
                    'order': 'temp_id.desc',
                    'limit': '1'
                });
                
                if (existing.length > 0) {
                    tempCounter = parseInt(existing[0].temp_id.split('-')[1]);
                }

                for (const row of results) {
                    try {
                        const is_new = !row.wca_id;
                        let temp_id = null;
                        
                        if (is_new) {
                            tempCounter++;
                            temp_id = `TEMP-${String(tempCounter).padStart(3, '0')}`;
                        }

                        await supabaseQuery('nfc_competitors', 'POST', {
                            competition_id,
                            wca_id: row.wca_id || null,
                            name: row.name,
                            email: row.email,
                            phone: row.phone,
                            is_new,
                            temp_id
                        });
                    } catch (err) {
                        errors.push({ row, error: err.message });
                    }
                }

                // Cleanup
                fs.unlinkSync(req.file.path);

                res.json({ 
                    success: true, 
                    imported: results.length - errors.length,
                    errors 
                });
            });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List competitors
app.get('/api/competitors/:comp_id', async (req, res) => {
    try {
        const result = await supabaseQuery('nfc_competitors', 'GET', null, {
            'competition_id': `eq.${req.params.comp_id}`,
            'order': 'name.asc'
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== NFC TAGS ====================

// Assign tag to competitor
app.post('/api/tag/assign', async (req, res) => {
    try {
        const { tag_uid, competition_id, wca_id, temp_id } = req.body;
        
        // Upsert tag
        const result = await supabaseQuery('nfc_tags', 'POST', {
            tag_uid,
            competition_id,
            wca_id: wca_id || null,
            temp_id: temp_id || null,
            assigned_at: new Date().toISOString(),
            status: 'assigned'
        }, {
            'Prefer': 'return=representation,resolution=merge-duplicates'
        });

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload tags CSV
app.post('/api/tags/csv', upload.single('file'), async (req, res) => {
    try {
        const competition_id = req.body.competition_id;
        const results = [];
        const errors = [];

        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (row) => results.push(row))
            .on('end', async () => {
                for (const row of results) {
                    try {
                        await supabaseQuery('nfc_tags', 'POST', {
                            tag_uid: row.tag_uid,
                            competition_id,
                            wca_id: row.wca_id || null,
                            temp_id: row.temp_id || null,
                            assigned_at: new Date().toISOString(),
                            status: 'assigned'
                        }, {
                            'Prefer': 'return=representation,resolution=merge-duplicates'
                        });
                    } catch (err) {
                        errors.push({ row, error: err.message });
                    }
                }

                fs.unlinkSync(req.file.path);

                res.json({ 
                    success: true, 
                    imported: results.length - errors.length,
                    errors 
                });
            });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List tags
app.get('/api/tags/:comp_id', async (req, res) => {
    try {
        const result = await supabaseQuery('nfc_tags', 'GET', null, {
            'competition_id': `eq.${req.params.comp_id}`,
            'order': 'assigned_at.desc'
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lookup tag (for attendance)
app.get('/api/tag/lookup/:uid', async (req, res) => {
    try {
        const result = await supabaseQuery('nfc_tags', 'GET', null, {
            'tag_uid': `eq.${req.params.uid}`
        });
        
        if (result.length === 0) {
            return res.json({ found: false });
        }

        const tag = result[0];
        
        // Get competitor name
        let competitor = null;
        if (tag.wca_id) {
            const comp = await supabaseQuery('nfc_competitors', 'GET', null, {
                'competition_id': `eq.${tag.competition_id}`,
                'wca_id': `eq.${tag.wca_id}`
            });
            if (comp.length > 0) competitor = comp[0];
        } else if (tag.temp_id) {
            const comp = await supabaseQuery('nfc_competitors', 'GET', null, {
                'competition_id': `eq.${tag.competition_id}`,
                'temp_id': `eq.${tag.temp_id}`
            });
            if (comp.length > 0) competitor = comp[0];
        }

        res.json({
            found: true,
            tag,
            competitor
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== CHECK-INS ====================

// Record attendance
app.post('/api/checkin', async (req, res) => {
    try {
        const { competition_id, wca_id, temp_id, competitor_name, tag_uid, event_id, table_number, method } = req.body;
        
        const result = await supabaseQuery('nfc_check_ins', 'POST', {
            competition_id,
            wca_id: wca_id || null,
            temp_id: temp_id || null,
            competitor_name,
            tag_uid,
            event_id,
            table_number,
            method: method || 'nfc'
        });

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance list
app.get('/api/checkin/:comp_id', async (req, res) => {
    try {
        const { event_id, table_number } = req.query;
        
        let params = {
            'competition_id': `eq.${req.params.comp_id}`,
            'order': 'check_in_time.desc'
        };

        if (event_id) params['event_id'] = `eq.${event_id}`;
        if (table_number) params['table_number'] = `eq.${table_number}`;

        const result = await supabaseQuery('nfc_check_ins', 'GET', null, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export attendance CSV
app.get('/api/checkin/:comp_id/export', async (req, res) => {
    try {
        const result = await supabaseQuery('nfc_check_ins', 'GET', null, {
            'competition_id': `eq.${req.params.comp_id}`,
            'order': 'check_in_time.asc'
        });

        const csvWriter = createObjectCsvWriter({
            path: '/tmp/attendance.csv',
            header: [
                { id: 'competitor_name', title: 'Name' },
                { id: 'wca_id', title: 'WCA ID' },
                { id: 'temp_id', title: 'Temp ID' },
                { id: 'event_id', title: 'Event' },
                { id: 'table_number', title: 'Table' },
                { id: 'check_in_time', title: 'Check-in Time' },
                { id: 'method', title: 'Method' }
            ]
        });

        await csvWriter.writeRecords(result);
        
        res.download('/tmp/attendance.csv', 'attendance.csv', (err) => {
            fs.unlinkSync('/tmp/attendance.csv');
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual check-in (by WCA ID or name)
app.post('/api/checkin/manual', async (req, res) => {
    try {
        const { competition_id, identifier, event_id, table_number } = req.body;
        
        // Find competitor
        let competitor = null;
        
        // Try WCA ID first
        if (identifier.match(/^\d{4}[A-Z]{4}\d{2}$/)) {
            const result = await supabaseQuery('nfc_competitors', 'GET', null, {
                'competition_id': `eq.${competition_id}`,
                'wca_id': `eq.${identifier}`
            });
            if (result.length > 0) competitor = result[0];
        }
        
        // Try temp ID
        if (!competitor && identifier.match(/^TEMP-\d+$/)) {
            const result = await supabaseQuery('nfc_competitors', 'GET', null, {
                'competition_id': `eq.${competition_id}`,
                'temp_id': `eq.${identifier}`
            });
            if (result.length > 0) competitor = result[0];
        }
        
        // Try name search
        if (!competitor) {
            const result = await supabaseQuery('nfc_competitors', 'GET', null, {
                'competition_id': `eq.${competition_id}`,
                'name': `ilike.%${identifier}%`
            });
            if (result.length > 0) competitor = result[0];
        }

        if (!competitor) {
            return res.status(404).json({ error: 'Competitor not found' });
        }

        const checkin = await supabaseQuery('nfc_check_ins', 'POST', {
            competition_id,
            wca_id: competitor.wca_id,
            temp_id: competitor.temp_id,
            competitor_name: competitor.name,
            tag_uid: null,
            event_id,
            table_number,
            method: 'manual'
        });

        res.json({ success: true, data: checkin, competitor });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== STATS ====================

// Get competition stats
app.get('/api/stats/:comp_id', async (req, res) => {
    try {
        const { event_id } = req.query;
        
        // Total competitors
        const competitors = await supabaseQuery('nfc_competitors', 'GET', null, {
            'competition_id': `eq.${req.params.comp_id}`,
            'select': 'id'
        });
        
        // Total tags assigned
        const tags = await supabaseQuery('nfc_tags', 'GET', null, {
            'competition_id': `eq.${req.params.comp_id}`,
            'status': 'eq.assigned',
            'select': 'tag_uid'
        });
        
        // Total check-ins
        let checkinParams = {
            'competition_id': `eq.${req.params.comp_id}`,
            'select': 'id'
        };
        if (event_id) checkinParams['event_id'] = `eq.${event_id}`;
        
        const checkins = await supabaseQuery('nfc_check_ins', 'GET', null, checkinParams);

        res.json({
            total_competitors: competitors.length,
            tags_assigned: tags.length,
            total_checkins: checkins.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`NFC Attendance running on port ${PORT}`);
});