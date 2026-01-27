import express from 'express'
import bodyParser from 'body-parser'
import fetch from 'node-fetch'
import qs from 'qs'
import cors from 'cors'

import { config } from './config/index.js'
import { supabase } from './config/index.js'
import { requireAuth } from './services/auth.js'

import { loginUser, createAccountAndUser } from './services/auth.js'
import { runDailyInvoiceCheck } from './services/jobs.js'
import { handleStripeWebhook } from './services/webhooks.js'
import { connectIntegration, syncInvoices, syncCustomers } from './services/integrations.js'

const app = express()

app.use(express.json())
app.use(bodyParser.json())
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}))

app.get('/health', (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() })
})

app.get('/health/supabase', async (req, res) => {
    const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1)

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    res.json({ ok: true, data })
})

// AUTH ROUTES //
app.post('/auth/login', async (req, res) => {
    console.log(req.body)
    try {
        const result = await loginUser(req.body)
        console.log(result.token)
        res.json({ token: result.token })
    } catch (err) {
        console.error(err)
        res.status(400).json({ error: err.message })
    }
})

app.post('/auth/signup', async (req, res) => {
    try {
        const accountAndUser = await createAccountAndUser(req.body)
        res.json(accountAndUser)
    } catch (err) {
        console.error(err)
        res.status(400).json({ error: err.message })
    }
})

app.get('/me', requireAuth, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, account_id, created_at')
            .eq('id', req.user.id)
            .single()

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' })
        }

        res.json({ user })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

app.get('/profile', requireAuth, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, account_id, created_at')
            .eq('id', req.user.id)
            .single()

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' })
        }

        const { data: account, error: accErr } = await supabase
            .from('accounts')
            .select('id, name')
            .eq('id', user.account_id)
            .single()

        if (accErr || !account) {
            return res.status(404).json({ error: 'Profile not found' })
        }

        res.json({ account })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error' })
    }
})

// CRON ROUTES //
app.post('/jobs/daily', async (req, res) => {
    try {
        await runDailyInvoiceCheck()
        res.json({ ok: true })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to run daily job' })
    }
})

// STRIPE ROUTES //
app.post('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    try {
        await handleStripeWebhook(req)
        res.status(200).send('Webhook received')
    } catch (err) {
        console.error('Stripe webhook error:', err)
        res.status(400).send('Webhook error')
    }
})

// QUICKBOOKS ROUTES //
app.get('/integrations/quickbooks/connect-test', (req, res) => {
    const clientId = process.env.QB_CLIENT_ID
    const redirectUri = `${process.env.APP_URL}/integrations/quickbooks/callback`
    const scope = 'com.intuit.quickbooks.accounting'
    const state = '47e1a9ee-311e-4437-9c0c-450269a4dd8b'

    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`

    res.redirect(authUrl)
})

app.get('/integrations/quickbooks/callback', async (req, res) => {
    const { code, state, realmId } = req.query
    
    if (!code || !state || !realmId) {
        return res.status(400).json({ error: 'Missing code, state, or realmId' })
    }

    try {
        const authHeader = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64')
        const body = qs.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${process.env.APP_URL}/integrations/quickbooks/callback`
        })

        const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        })

        const tokenData = await tokenRes.json()
        const { access_token, refresh_token } = tokenData

        const accountId = state

        const integration = await connectIntegration(accountId, 'quickbooks', access_token, refresh_token, realmId)

        res.json({ success: true, integration })
    } catch (err) {
        console.error('QuickBooks OAuth error:', err)
        res.status(400).json({ error: err.message })
    }
})

// INVOICE ROUTES //

app.get('/invoices', requireAuth, async (req, res) => {
    try {
        const { data: invoices, error } = await supabase
            .from('invoices')
            .select(`
                id,
                external_id,
                amount_due,
                currency,
                due_date,
                status,
                customer_id,
                external_customer_id,
                metadata,
                created_at
            `)
            .eq('account_id', req.user.accountId)
            .order('due_date', { ascending: true })

        if (error) throw error

        res.json({ invoices })
    } catch (err) {
        console.error('Error fetching invoices:', err)
        res.status(500).json({ error: 'Failed to fetch invoices' })
    }
})

app.post('/invoices/sync', requireAuth, async (req, res) => {
    try {
        const success = await syncInvoices(req.user.accountId)
        if (success) {
            return res.json({ ok: true, message: 'Invoices synced successfully' })
        } else {
            return res.status(500).json({ ok: false, error: 'No active QuickBooks integration or failed to sync' })
        }
    } catch (err) {
        console.error('Error syncing invoices:', err)
        res.status(500).json({ ok: false, error: 'Failed to sync invoices' })
    }
})

// RULES ROUTES //
app.get('/rules', requireAuth, async (req, res) => {
    try {
        const { data: rules, error } = await supabase
            .from('reminder_rules')
            .select(`
                id,
                days_overdue,
                subject_line,
                message,
                created_at,
                name,
                color
            `)
            .eq('account_id', req.user.accountId)
            .order('days_overdue', { ascending: true })

        if (error) throw error

        res.json({ rules })
    } catch (err) {
        console.error('Error fetching rules:', err)
        res.status(500).json({ error: 'Failed to fetch rules' })
    }
})

app.get('/rules/data', requireAuth, async (req, res) => {
    try {
        const { id } = req.query
        console.log(id)

        if (!id) {
            return res.status(400).json({ error: 'Missing rule id' })
        }

        const { data: rule, error } = await supabase
            .from('reminder_rules')
            .select(`
                name,
                color,
                id,
                days_overdue,
                subject_line,
                message,
                created_at
            `)
            .eq('account_id', req.user.accountId)
            .eq('id', id)
            .single()

        if (error) throw error

        res.json(rule)
    } catch (err) {
        console.error('Error fetching rule data:', err)
        res.status(500).json({ error: 'Failed to fetch rule data' })
    }
})

app.post('/rules/save', requireAuth, async (req, res) => {
    try {
        const { id } = req.query
        const { name, accountId, subject, body, color, days_overdue } = req.body

        if (!id) {
            console.error('No rule id provided')
        }
        
        const { data, error } = await supabase
                .from('reminder_rules')
                .upsert({
                    id,
                    days_overdue,
                    account_id: accountId,
                    name,
                    subject_line: subject,
                    message: body,
                    color
                }, { onConflict: ['id'] })
                .select('*')

            if (error) {
                console.error('Failed to upsert rule', id, error)
            }

            res.json({ ok: true, rule: data[0] })
    } catch (err) {
        console.error('Error saving rule:', err)
        res.status(500).json({ ok: false, error: 'Failed to save rule' })
    }
})


// CUSTOMER ROUTES //
app.post('/customers/sync', requireAuth, async (req, res) => {
    try {
        const success = await syncCustomers(req.user.accountId)
        if (success) {
            return res.json({ ok: true, message: 'Customers synced successfully' })
        } else {
            return res.status(500).json({ ok: false, error: 'QuickBooks integration or failed to sync' })
        }
    } catch (err) {
        console.error('Error syncing customers:', err)
        res.status(500).json({ ok: false, error: 'Failed to sync customers' })
    }
})

// START SERVER //
app.listen(config.port, () => {
    console.log(`Chasin API running on port ${config.port}`)
})