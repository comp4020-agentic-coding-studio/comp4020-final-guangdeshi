// Image upload validation: real file-signature checking (not trusting
// Content-Type), size/dimension bounds, and the 1-4 image count limit.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { baseUrl, registerUser } from "./helpers.ts";

async function postWithFiles(session: Awaited<ReturnType<typeof registerUser>>, files: { buffer: Buffer | Uint8Array; name: string; type: string }[]): Promise<Response> {
  const form = new FormData();
  form.set("csrf", session.csrfToken);
  form.set("title", "Upload validation test post");
  form.set("description", "Checking upload validation behavior end to end");
  form.set("category", "computing");
  form.set("visibility", "public");
  for (const f of files) form.append("images", new Blob([f.buffer as BlobPart], { type: f.type }), f.name);
  return fetch(new URL("/posts/new", baseUrl()), {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: `bop_session=${session.sessionCookie}; bop_csrf=${session.csrfToken}` },
    body: form,
  });
}

describe("upload validation", () => {
  it("rejects a file that merely claims to be an image but has no real image signature", async () => {
    const session = await registerUser();
    const fakeImage = Buffer.from("this is definitely not an image, just text pretending with a .jpg name");
    const res = await postWithFiles(session, [{ buffer: fakeImage, name: "fake.jpg", type: "image/jpeg" }]);
    expect(res.status).toBe(400);
  });

  it("rejects an image smaller than the minimum allowed dimensions", async () => {
    const session = await registerUser();
    const tiny = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const res = await postWithFiles(session, [{ buffer: tiny, name: "tiny.png", type: "image/png" }]);
    expect(res.status).toBe(400);
  });

  it("accepts a valid image and re-encodes it (served image is a real decodable JPEG)", async () => {
    const session = await registerUser();
    const valid = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
    const res = await postWithFiles(session, [{ buffer: valid, name: "valid.png", type: "image/png" }]);
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    const postPage = await fetch(new URL(location, baseUrl()));
    const html = await postPage.text();
    const imageIdMatch = html.match(/\/images\/([a-f0-9-]{36})/);
    expect(imageIdMatch).not.toBeNull();

    const imageRes = await fetch(new URL(`/images/${imageIdMatch![1]}`, baseUrl()));
    expect(imageRes.status).toBe(200);
    expect(imageRes.headers.get("content-type")).toBe("image/jpeg");
    const bytes = Buffer.from(await imageRes.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
  });

  it("accepts up to 4 images and rejects a 5th", async () => {
    const session = await registerUser();
    const img = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
    const fourFiles = [1, 2, 3, 4].map((i) => ({ buffer: img, name: `img${i}.png`, type: "image/png" }));
    const okRes = await postWithFiles(session, fourFiles);
    expect(okRes.status).toBe(303);

    const fiveFiles = [1, 2, 3, 4, 5].map((i) => ({ buffer: img, name: `img${i}.png`, type: "image/png" }));
    const session2 = await registerUser();
    const tooMany = await postWithFiles(session2, fiveFiles);
    expect(tooMany.status).toBe(400);
  });

  it("rejects path-traversal-shaped image ids rather than touching the filesystem", async () => {
    const res = await fetch(new URL("/images/" + encodeURIComponent("../../../etc/passwd"), baseUrl()));
    expect(res.status).toBe(404);
  });
});
