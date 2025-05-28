import { schema } from '@osd/config-schema';

export const config = {
  schema: schema.object({
    nodes: schema.arrayOf(schema.string(), { defaultValue: [] }),
    // enabled: schema.boolean({ defaultValue: true }),
  }),
};
