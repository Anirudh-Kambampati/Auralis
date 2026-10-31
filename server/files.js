// Neon Object Storage (S3-compatible) via the Files SDK. The neon adapter reads the AWS_* vars
// that `neon deploy` pulled into .env.local, so only the bucket name (declared in neon.ts) is passed here.
import { Files } from 'files-sdk';
import { neon } from 'files-sdk/neon';

export const BUCKET = 'assets';
export const files = process.env.AWS_ENDPOINT_URL_S3 ? new Files({ adapter: neon({ bucket: BUCKET }) }) : null;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const isPng = (buf) => buf.length > 8 && PNG.every((b, i) => buf[i] === b);
