import { supabase } from '../config/index.js'
import fetch from 'node-fetch'

export async function connectIntegration(accountId, provider, access_token, refresh_token, realmId) {    
    const { data, error } = await supabase
        .from('integrations')
        .upsert({
            account_id: accountId,
            provider,
            access_token,
            refresh_token,
            status: 'active',
            metadata: { realmId }
        })
        .select('*')
        .single()

    if (error) throw error
    return data
}

export async function syncInvoices(accountId) {    
    const { data: integration, error: intErr } = await supabase
        .from('integrations')
        .select('*')
        .eq('account_id', accountId)
        .eq('provider', 'quickbooks')
        .eq('status', 'active')
        .single()

    if (intErr || !integration) {
        console.error('No acive QuickBooks integration found:', intErr)
        return false
    }

    const realmId = integration.metadata?.realmId
    if (!realmId) {
        console.error('Missing QuickBooks realmId for integration')
        return false
    }

    try {
        const invoices = await fetchInvoices(integration.access_token, realmId)

        for (const inv of invoices) {
            const { data, error } = await supabase
                .from('invoices')
                .upsert({
                    account_id: accountId,
                    external_id: inv.Id,
                    amount_due: inv.TotalAmt,
                    currency: inv.CurrencyRef?.value || 'usd',
                    due_date: inv.DueDate,
                    status: inv.Balance > 0 ? 'pending' : 'paid',
                    customer_id: null,
                    external_customer_id: inv.CustomerRef?.value || null,
                    metadata: inv
                }, { onConflict: ['external_id'] })
                .select('*')

            if (error) {
                console.error('Failed to upsert invoice', inv.Id, error)
            }

            if (!error && data?.[0]?.id) {
                await supabase.from('invoice_events').insert({
                    invoice_id: data[0].id,
                    type: 'sync',
                    metadata: inv
                })
            }
        }
        return true
    } catch (err) {
        console.error('Error syncing invoices:', err)
        return false
    }
}

export async function fetchInvoices(access_token, realmId) {
    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/query?query=SELECT * FROM Invoice`

    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Accept': 'application/json'
        }
    })

    const data = await res.json()
    return data.QueryResponse?.Invoice || []
}

export async function syncCustomers(accountId) {    
    const { data: integration, error: intErr } = await supabase
        .from('integrations')
        .select('*')
        .eq('account_id', accountId)
        .eq('provider', 'quickbooks')
        .eq('status', 'active')
        .single()

    if (intErr || !integration) {
        console.error('No active QuickBooks integration found:', intErr)
        return false
    }

    const realmId = integration.metadata?.realmId
    if (!realmId) {
        console.error('Missing QuickBooks realmId for integration')
        return false
    }

    try {
        const query = encodeURIComponent('SELECT * FROM Customer')
        const res = await fetch(
            `https://sandbox-quickbooks.api.intuit.com/v3/company/$%7BrealmId%7D/query?query=${query}`,
            {
                headers: {
                    'Authorization': `Bearer ${integration.access_token}`,
                    'Accept': 'application/json',
                }
            }
        )

        const qbData = await res.json()
        const customers = qbData.QueryResponse?.Customer || []

        for (const cust of customers) {
            try {
                const { data, error } = await supabase
                    .from('customers')
                    .upsert({
                        account_id: accountId,
                        external_id: cust.Id,
                        name: cust.DisplayName,
                        email: cust.PrimaryEmailAddr?.Address || null,
                    }, { onConflict: 'external_id' })
                    .select('*')

                if (error) {
                    console.error('Failed to upsert customer', cust.Id, error)
                }
            } catch (err) {
                console.error('Error processing customer', cust.Id, err)
            }
        }

        console.log(`Synced ${customers.length} customers for account ${accountId}`)
        return true
    } catch (err) {
        console.error('Error syncing customers:', err)
        return false
    }
}

export async function processIntegrationEvent(event) {
    console.log('processIntegrationEvent called:', event)
    return true
}