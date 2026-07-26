import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

const isProd = import.meta.env.PROD;

// All published posts (drafts hidden in production), newest first.
export async function getSortedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !(isProd && data.draft));
  return posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );
}

// Build a tag -> count map across all published posts.
export async function getTagCounts(): Promise<Map<string, number>> {
  const posts = await getSortedPosts();
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}
