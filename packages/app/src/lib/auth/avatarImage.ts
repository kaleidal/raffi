const AVATAR_SIZE = 256;

export const prepareAvatarImage = async (file: Blob): Promise<Blob> => {
    const bitmap = await createImageBitmap(file);
    try {
        const side = Math.min(bitmap.width, bitmap.height);
        const canvas = new OffscreenCanvas(AVATAR_SIZE, AVATAR_SIZE);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image processing is unavailable");
        context.imageSmoothingQuality = "high";
        context.drawImage(
            bitmap,
            (bitmap.width - side) / 2,
            (bitmap.height - side) / 2,
            side,
            side,
            0,
            0,
            AVATAR_SIZE,
            AVATAR_SIZE,
        );
        return await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
    } finally {
        bitmap.close();
    }
};
