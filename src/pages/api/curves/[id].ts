import type { NextApiRequest, NextApiResponse } from 'next';
import { deleteCurve, getCurve } from '@/lib/curve-store';

type ApiResponse = { status: 'success'; message: string } | { status: 'error'; message: string };

export default async function handler(request: NextApiRequest, response: NextApiResponse<ApiResponse>) {
    const { id } = request.query;
    const identifier = Array.isArray(id) ? id[0] : id;

    if (!identifier) {
        response.status(400).json({ status: 'error', message: 'Curve identifier is required.' });
        return;
    }

    if (request.method === 'DELETE') {
        const curve = await getCurve(identifier);
        if (!curve) {
            response.status(404).json({ status: 'error', message: 'Curve not found.' });
            return;
        }
        await deleteCurve(identifier);
        response.status(200).json({ status: 'success', message: 'Curve removed.' });
        return;
    }

    response.setHeader('Allow', ['DELETE']);
    response.status(405).json({ status: 'error', message: 'Method not allowed.' });
}
