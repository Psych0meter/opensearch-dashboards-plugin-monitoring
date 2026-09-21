import { schema } from '@osd/config-schema';

export const config = {
  schema: schema.object({
    /**
     * Deprecated: the expected node inventory is now derived automatically
     * from opensearch.hosts (see server/routes/index.ts). This field is
     * kept only so existing configs with monitoring.nodes still set don't
     * fail schema validation on startup; its value is no longer read. A
     * deprecation warning is logged if it's non-empty - see plugin.ts.
     */
    nodes: schema.arrayOf(schema.string(), { defaultValue: [] }),
  }),
};
