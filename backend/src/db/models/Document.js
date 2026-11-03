import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    tenant: { type: String, required: true },
    fileName: { type: String, required: true },
    relPath: String,
    docType: String, // catalog | datasheet | flyer | manual | marketing | pricing | terms | service | other
    sha256: String,
    pageCount: Number,
    pagesWithoutText: [Number],
    ocrPages: [Number],
    effectiveDate: String, // ISO-ish, derived from the document text (revision / valid-from / issue date)
    revision: String,
    familyKey: String, // identifies "the same document" across revisions (e.g. datasheet:44.0672)
    status: { type: String, enum: ['current', 'superseded'], default: 'current' },
    supersededBy: { type: String, default: null },
    ingestedAt: { type: Date, default: Date.now },
  },
  { collection: 'documents' },
);
schema.index({ tenant: 1, fileName: 1 }, { unique: true });
schema.index({ tenant: 1, familyKey: 1 });

export const DocumentModel = mongoose.models.Document || mongoose.model('Document', schema);
