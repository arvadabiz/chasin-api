import { supabase } from "../config/index.js"
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
})

export async function sendEmail({ to, subject, body }) {    
    try {
        const info = await transporter.sendMail({
            from: '"Chasin" <billing@chasin.ai>',
            to,
            subject,
            text: body,
            html: `<p>${body.replace(/\n/g, '<br />')}</p>`
        })

        console.log('Email sent:', info.messageId)
        return true
    } catch (err) {
        console.error('Failed to send email:', err)
        return false
    }
}

function renderTemplate(template, data) {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
        if (!(key in data)) {
            throw new Error(`Unknown template variable: ${key}`)
        }
        return data[key]
    })
}

export async function sendInvoiceReminder(invoice) {
    const email = invoice.metadata.BillEmail.Address
    const rule = await checkReminderRules(invoice)
    console.log(invoice.metadata.DocNumber)
    
    if (!rule) return false
    
    const message = renderTemplate(rule.message, {
        customer_name: invoice.metadata.CustomerRef?.name || 'there',
        invoice_number: invoice.metadata.DocNumber,
        amount_due: invoice.metadata.TotalAmt,
        days_overdue: rule.days_overdue
    })

    const subject = renderTemplate(rule.subject_line, {
        invoice_number: invoice.metadata.DocNumber
    })

    await sendEmail({
        to: email,
        subject,
        body: message
    })

    return true
}

export async function checkReminderRules(invoice) {
    const accountId = invoice.account_id

    const due = new Date(invoice.due_date)
    const today = new Date()

    const diffMs = Math.floor((today - due) / (1000 * 60 * 60 * 24))
    
    console.log(invoice.metadata.CustomerRef?.name || 'Unknown')
    console.log(accountId)
    console.log(diffMs)

    const { data, error } = await supabase
        .from('reminder_rules')
        .select('*')
        .eq('account_id', accountId)
        .eq('days_overdue', diffMs)
        .single()

    if (error) return null
    return data
}