const ids = ["image-cropper","image-resizer","image-compressor","image-sharpen","brightness-contrast","image-watermark","background-remover","profile-picture-maker","social-image-resizer","image-image-metadata-cleaner","jpg-converter","webp-converter"];
export const getToolById = (id: string) => ids.includes(id) ? { id } : undefined;
export const toolPath = (t: any) => "/tools/image/" + t.id;
