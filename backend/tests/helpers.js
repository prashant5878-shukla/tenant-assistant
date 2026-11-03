/** Deterministic bag-of-words embedder: same text -> same vector, similar words -> similar vectors. No API needed. */
export class FakeEmbedder {
  static DIM = 256;
  #vec(text) {
    const v = new Array(FakeEmbedder.DIM).fill(0);
    for (const w of text.toLowerCase().match(/[a-z0-9.]+/g) ?? []) {
      let h = 0;
      for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % FakeEmbedder.DIM;
      v[h] += 1;
    }
    return v;
  }
  async embedDocuments(texts) {
    return texts.map((t) => this.#vec(t));
  }
  async embedQuery(t) {
    return this.#vec(t);
  }
}
