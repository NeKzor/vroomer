// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { defineConfig } from '$fresh/server.ts';
import twindPlugin from '$fresh/plugins/twind.ts';
import twindConfig from './twind.config.ts';

export default defineConfig({
  plugins: [twindPlugin(twindConfig)],
});
