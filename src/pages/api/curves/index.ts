import type { NextApiRequest, NextApiResponse } from 'next';
import { createCurve, listCurves } from '@/lib/curve-store';
import { validateExpression } from '@/utils/expression';

type ApiResponse =
    | { status: 'success'; data: Awaited<ReturnType<typeof listCurves>> }
    | { status: 'success'; data: Awaited<ReturnType<typeof createCurve>> }
    | { status: 'error'; message: string };

export default async function handler(request: NextApiRequest, response: NextApiResponse<ApiResponse>) {
    if (request.method === 'GET') {
        const curves = await listCurves();
        response.status(200).json({ status: 'success', data: curves });
        return;
    }

    if (request.method === 'POST') {
        const { name, expression, description } = request.body ?? {};
        if (typeof name !== 'string' || name.trim().length === 0) {
            response.status(400).json({ status: 'error', message: 'Curve name is required.' });
            return;
        }
        if (typeof expression !== 'string' || expression.trim().length === 0) {
            response.status(400).json({ status: 'error', message: 'Curve expression is required.' });
            return;
        }

        const validationError = validateExpression(expression);
        if (validationError) {
            response.status(400).json({ status: 'error', message: validationError });
            return;
        }

        const record = await createCurve({ name, expression, description });
        response.status(201).json({ status: 'success', data: record });
        return;
    }

    response.setHeader('Allow', ['GET', 'POST']);
    response.status(405).json({ status: 'error', message: 'Method not allowed.' });
}
