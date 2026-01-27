import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { supabase } from '../config/index.js'

const SALT_ROUNDS = 12

export async function loginUser({ email, password }) {    
    const { data: user } = await supabase
        .from('users')
        .select('id, email, account_id, password_hash')
        .eq('email', email)
        .single()

    if (!user) {
        throw new Error('Invalid credentials')
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
        throw new Error('Invalid credentials')
    }

    const token = jwt.sign(
        {
            userId: user.id,
            accountId: user.account_id,
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    )

    return {
        user: {
            id: user.id,
            email: user.email,
            account_id: user.account_id,
        },
        token,
    }
}

export async function createAccountAndUser({ accountName, email, password }) {    
    const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single()

    if (existing) {
        throw new Error('User already exists')
    }

    const { data: account, error: accountError } = await supabase
        .from('accounts')
        .insert({ name: accountName })
        .select('id, name')
        .single()

    if (accountError) {
        throw accountError
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS)

    const { data: user, error: userError } = await supabase
        .from('users')
        .insert({
            account_id: account.id,
            email,
            password_hash,
        })
        .select('id, email, account_id')
        .single()

    if (userError) {
        throw userError
    }

    const token = jwt.sign(
        {
            userId: user.id,
            accountId: user.account_id,
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    )

    return {
        account,
        user,
        token,
    }
}

export function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader) {
            return res.status(401).json({ error: 'Missing Authorization header' })
        }

        const token = authHeader.split(' ')[1]
        if (!token) {
            return res.status(401).json({ error: 'Invalid Authorization header' })
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET)
        req.user = { id: payload.userId, accountId: payload.accountId }
        req.accountId = payload.accountId
        next()
    } catch (err) {
        console.error(err)
        return res.status(401).json({ error: 'Invalid token' })
    }
}