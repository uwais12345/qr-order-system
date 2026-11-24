import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { requireAuth } from '../../middlewares/auth.js';
import { loginSchema, refreshSchema } from './auth.schema.js';
import { loginHandler, refreshHandler, meHandler, logoutHandler } from './auth.controller.js';

const router = Router();

router.post('/login', validateRequest({ body: loginSchema }), loginHandler);
router.post('/refresh', validateRequest({ body: refreshSchema }), refreshHandler);
router.get('/me', requireAuth, meHandler);
router.post('/logout', requireAuth, logoutHandler);

export default router;
