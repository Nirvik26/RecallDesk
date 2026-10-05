def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[dict]:
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError('Chunk size must be positive and overlap must be smaller than the chunk size.')
    chunks = []
    start = 0
    idx = 0
    clean_text = text.replace("\r\n", "\n")
    
    while start < len(clean_text):
        end = min(start + chunk_size, len(clean_text))
        slice_str = clean_text[start:end].strip()
        if slice_str:
            chunks.append({
                "chunkIndex": idx,
                "content": slice_str
            })
            idx += 1
        start += (chunk_size - overlap)
    return chunks
