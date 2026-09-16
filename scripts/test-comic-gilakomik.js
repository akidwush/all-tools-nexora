"use strict";

const assert = require("node:assert/strict");
const adapter = require("../lib/comic-sources/gilakomik");

async function run() {
    assert.equal(adapter.definition.id, "gilakomik");
    assert.equal(adapter.definition.policy, "standard");

    const fakeFetch = async (url) => {
        let responseBody = {};
        const urlStr = url.toString();
        if (urlStr.includes("/manga/chapter/")) {
            responseBody = { chapter_image: ["https://gilakomik.id/img1.jpg"] };
        } else if (urlStr.includes("/manga/search/") || urlStr.includes("/manga/latest")) {
            responseBody = { data: [{ slug: "test-manga", title: "Test Manga Title", cover_url: "https://gilakomik.id/cover.webp" }] };
        } else if (urlStr.includes("/manga/")) {
            responseBody = { data: { slug: "test-manga", title: "Test Manga Title", cover_url: "https://gilakomik.id/cover.webp", chapter_list: [{slug: "chap-1", title: "Chapter 1", chapter_number: "1"}] } };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => JSON.stringify(responseBody) };
    };

    const searchRes = await adapter.search({ query: "test", fetchImpl: fakeFetch, timeoutMs: 10000 });
    assert.equal(searchRes.items.length, 1);
    assert.equal(searchRes.items[0].id, "test-manga");

    const mangaRes = await adapter.getManga({ id: "test-manga", fetchImpl: fakeFetch, timeoutMs: 10000 });
    assert.equal(mangaRes.id, "test-manga");

    const chapRes = await adapter.getChapters({ mangaId: "test-manga", fetchImpl: fakeFetch, timeoutMs: 10000 });
    assert.equal(chapRes.length, 1);
    assert.equal(chapRes[0].id, "chap-1");

    const pagesRes = await adapter.getPages({ chapterId: "chap-1", fetchImpl: fakeFetch, timeoutMs: 10000 });
    assert.equal(pagesRes.length, 1);

    console.log("PASS: GilaKomik adapter tests");
}
run().catch(console.error);
