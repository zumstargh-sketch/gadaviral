import { sql } from '../src/db/client.js';
import { hashPassword } from '../src/utils/crypto.js';
import type { DemoIdentity } from './userFactory.js';
import { saveAvatar, saveCover, writeSeedMedia } from './media.js';

/** Insert one demo user + profile with full demo tagging. */
export async function insertDemoUser(identity: DemoIdentity, batch: string, avatarSeed: number) {
  writeSeedMedia();
  const avatar = await saveAvatar(identity.fullName, avatarSeed);
  const cover = saveCover(identity.hometown, avatarSeed + 7);
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, username, auth_provider,
                       email_verified, email_verified_at, is_demo, seed_batch, demo_source, created_at)
    VALUES (${identity.email}, ${hashPassword(identity.password)}, ${identity.fullName}, ${identity.username},
            'EMAIL', true, ${identity.createdAt}, true, ${batch}, 'seed-demo', ${identity.createdAt})
    RETURNING id`;
  const userId = rows[0].id as string;
  await sql`
    INSERT INTO profiles (user_id, avatar_url, cover_url, bio, gender, location, hometown, community,
                          ethnic_group, occupation, education, interests, languages, created_at)
    VALUES (${userId}, ${avatar}, ${cover}, ${identity.bio}, ${identity.gender}, ${identity.location},
            ${identity.hometown}, ${identity.community},
            ${identity.ethnic === 'UNSPECIFIED' ? 'UNSPECIFIED' : identity.ethnic},
            ${identity.occupation}, ${'Community School & Life Experience'},
            ${identity.interests}, ${identity.languages}, ${identity.createdAt})`;
  return userId;
}
