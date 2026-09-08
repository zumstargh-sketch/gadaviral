import { Router } from 'express';
import authRoutes from './auth.routes.js';
import authSecurityRoutes from './authSecurity.routes.js';
import usersProfileRoutes from './usersProfile.routes.js';
import usersMediaRoutes from './usersMedia.routes.js';
import usersGraphRoutes from './usersGraph.routes.js';
import usersAccountRoutes from './usersAccount.routes.js';
import postsCreateRoutes from './posts/create.routes.js';
import postsFeedRoutes from './posts/feed.routes.js';
import postsInteractionsRoutes from './posts/interactions.routes.js';
import postsShareVoteRoutes from './posts/sharevote.routes.js';
import groupsRoutes from './groups.routes.js';
import eventsRoutes from './events.routes.js';
import businessesRoutes from './businesses.routes.js';
import pagesRoutes from './pages.routes.js';
import notificationsRoutes from './notifications.routes.js';
import messagingRoutes from './messaging.routes.js';
import messagingSendRoutes from './messagingSend.routes.js';
import searchRoutes from './search.routes.js';
import reportsRoutes from './reports.routes.js';
import moderationRoutes from './moderation.routes.js';
import adminUsersRoutes from './adminUsers.routes.js';
import adminAnalyticsRoutes from './adminAnalytics.routes.js';
import adminDemoRoutes from './adminDemo.routes.js';
import healthRoutes from './health.routes.js';
import communityHighlightsRoutes from './communityHighlights.routes.js';
import devOutboxRoutes from './devOutbox.routes.js';

export const api = Router();

api.use('/auth', authRoutes);
api.use('/auth', authSecurityRoutes);
api.use('/health', healthRoutes);
api.use('/community', communityHighlightsRoutes); // public seeded-member preview (splash/auth pages)
api.use('/dev', devOutboxRoutes); // dev mailbox — self-404s outside dev mode

// Order matters: literal "/me/..." and list routes before "/:username"
api.use('/posts', postsFeedRoutes);        // GET /, GET /:id, PATCH/DELETE /:id
api.use('/posts', postsCreateRoutes);      // POST /, POST /media
api.use('/posts', postsInteractionsRoutes); // reactions + comments
api.use('/posts', postsShareVoteRoutes);   // share + vote + reactions list

api.use('/users', usersAccountRoutes);     // GET / (search), /me/settings, deactivate
api.use('/users', usersMediaRoutes);       // /me/avatar, /me/cover
api.use('/users', usersGraphRoutes);       // follow/block/mute/lists
api.use('/users', usersProfileRoutes);     // GET /:username, PATCH /me (last)

api.use('/groups', groupsRoutes);
api.use('/events', eventsRoutes);
api.use('/businesses', businessesRoutes);
api.use('/pages', pagesRoutes);
api.use('/notifications', notificationsRoutes);
api.use('/messages', messagingRoutes);
api.use('/messages', messagingSendRoutes);
api.use('/search', searchRoutes);
api.use('/reports', reportsRoutes);
api.use('/moderation', moderationRoutes);

api.use('/admin/users', adminUsersRoutes);
api.use('/admin', adminAnalyticsRoutes);
api.use('/admin/demo', adminDemoRoutes);
