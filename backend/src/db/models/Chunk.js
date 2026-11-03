import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    tenant: { type: String, required: true },
    docId: { type: mongoose.Schema.Types.ObjectId, required: true },
    fileName: { type: String, required: true },
    page: { type: Number, required: true },
    part: { type: Number, default: 0 },
    docType: String,
    effectiveDate: String,
    status: { type: String, default: 'current' },
    text: { type: String, required: true },
    embedding: { type: [Number], select: false }, // excluded unless explicitly selected
  },
  { collection: 'chunks' },
);
schema.index({ tenant: 1, docId: 1 });
// Compound text index with tenant prefix: every $text query MUST pin tenant by equality.
schema.index({ tenant: 1, text: 'text' }, { default_language: 'none', name: 'tenant_text' });

export const ChunkModel = mongoose.models.Chunk || mongoose.model('Chunk', schema);
