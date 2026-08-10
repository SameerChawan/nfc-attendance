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

// List competitors (exclude those who already have tags)
app.get('/api/competitors/:comp_id', async (req, res) => {
    try {
        const compId = req.params.comp_id;
        
        // Get all competitors for this competition
        const competitors = await supabaseQuery('nfc_competitors', 'GET', null, {
            'competition_id': `eq.${compId}`,
            'order': 'name.asc'
        });
        
        // Get all assigned tags for this competition
        const tags = await supabaseQuery('nfc_tags', 'GET', null, {
            'competition_id': `eq.${compId}`,
            'status': 'eq.assigned'
        });
        
        // Create set of assigned competitor IDs (wca_id or temp_id)
        const assignedWcaIds = new Set(tags.filter(t => t.wca_id).map(t => t.wca_id));
        const assignedTempIds = new Set(tags.filter(t => t.temp_id).map(t => t.temp_id));
        
        // Filter out competitors who already have tags
        const unassigned = competitors.filter(c => {
            if (c.wca_id && assignedWcaIds.has(c.wca_id)) return false;
            if (c.temp_id && assignedTempIds.has(c.temp_id)) return false;
            return true;
        });
        
        res.json(unassigned);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== NFC TAGS ====================

// Assign tag to competitor (check if already assigned)
app.post('/api/tag/assign', async (req, res) => {
    try {
        const { tag_uid, competition_id, wca_id, temp_id } = req.body;
        
        // Check if tag is already assigned
        const existingTag = await supabaseQuery('nfc_tags', 'GET', null, {
            'tag_uid': `eq.${tag_uid}`
        });
        
        if (existingTag.length > 0 && existingTag[0].status === 'assigned') {
            // Tag is already assigned - return error with current assignment info
            let assignedTo = existingTag[0].wca_id || existingTag[0].temp_id || 'Unknown';
            
            // Try to get competitor name
            if (existingTag[0].wca_id) {
                const comp = await supabaseQuery('nfc_competitors', 'GET', null, {
                    'competition_id': `eq.${existingTag[0].competition_id}`,
                    'wca_id': `eq.${existingTag[0].wca_id}`
                });
                if (comp.length > 0) assignedTo = comp[0].name + ' (' + assignedTo + ')';
            } else if (existingTag[0].temp_id) {
                const comp = await supabaseQuery('nfc_competitors', 'GET', null, {
                    'competition_id': `eq.${existingTag[0].competition_id}`,
                    'temp_id': `eq.${existingTag[0].temp_id}`
                });
                if (comp.length > 0) assignedTo = comp[0].name + ' (' + assignedTo + ')';
            }
            
            return res.status(409).json({ 
                error: 'Tag already assigned',
                assigned_to: assignedTo,
                competition_id: existingTag[0].competition_id
            });
        }
        
        // Check if competitor already has a tag
        const competitorId = wca_id || temp_id;
        if (competitorId) {
            const tagFilter = wca_id 
                ? { 'competition_id': `eq.${competition_id}`, 'wca_id': `eq.${competitorId}`, 'status': 'eq.assigned' }
                : { 'competition_id': `eq.${competition_id}`, 'temp_id': `eq.${competitorId}`, 'status': 'eq.assigned' };
            
            const existingCompTag = await supabaseQuery('nfc_tags', 'GET', null, tagFilter);
            
            if (existingCompTag.length > 0) {
                return res.status(409).json({
                    error: 'Competitor already has a tag',
                    existing_tag: existingCompTag[0].tag_uid
                });
            }
        }
        
        // Insert new tag assignment
        const result = await supabaseQuery('nfc_tags', 'POST', {
            tag_uid,
            competition_id,
            wca_id: wca_id || null,
            temp_id: temp_id || null,
            assigned_at: new Date().toISOString(),
            status: 'assigned'
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

// Record attendance (prevent duplicate general check-in)
app.post('/api/checkin', async (req, res) => {
    try {
        const { competition_id, wca_id, temp_id, competitor_name, tag_uid, event_id, table_number, method } = req.body;
        
        // Check for existing check-in (general check-in - no event/table specified)
        if (!event_id && !table_number) {
            // General check-in - check if already checked in (without event/table)
            const checkinFilter = wca_id 
                ? { 'competition_id': `eq.${competition_id}`, 'wca_id': `eq.${wca_id}`, 'event_id': 'is.null', 'table_number': 'is.null' }
                : { 'competition_id': `eq.${competition_id}`, 'temp_id': `eq.${temp_id}`, 'event_id': 'is.null', 'table_number': 'is.null' };
            
            const existingCheckin = await supabaseQuery('nfc_check_ins', 'GET', null, checkinFilter);
            
            if (existingCheckin.length > 0) {
                return res.status(409).json({ 
                    error: 'Already checked in',
                    check_in_time: existingCheckin[0].check_in_time,
                    method: existingCheckin[0].method
                });
            }
        }
        
        const result = await supabaseQuery('nfc_check_ins', 'POST', {
            competition_id,
            wca_id: wca_id || null,
            temp_id: temp_id || null,
            competitor_name,
            tag_uid,
            event_id: event_id || null,
            table_number: table_number || null,
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

// Manual check-in (by WCA ID or name) - prevent duplicates
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

        // Check for existing check-in (general check-in - no event/table specified)
        if (!event_id && !table_number) {
            const manualCheckinFilter = competitor.wca_id 
                ? { 'competition_id': `eq.${competition_id}`, 'wca_id': `eq.${competitor.wca_id}`, 'event_id': 'is.null', 'table_number': 'is.null' }
                : { 'competition_id': `eq.${competition_id}`, 'temp_id': `eq.${competitor.temp_id}`, 'event_id': 'is.null', 'table_number': 'is.null' };
            
            const existingCheckin = await supabaseQuery('nfc_check_ins', 'GET', null, manualCheckinFilter);
            
            if (existingCheckin.length > 0) {
                return res.status(409).json({ 
                    error: 'Already checked in',
                    competitor: competitor,
                    check_in_time: existingCheckin[0].check_in_time
                });
            }
        }

        const checkin = await supabaseQuery('nfc_check_ins', 'POST', {
            competition_id,
            wca_id: competitor.wca_id,
            temp_id: competitor.temp_id,
            competitor_name: competitor.name,
            tag_uid: null,
            event_id: event_id || null,
            table_number: table_number || null,
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