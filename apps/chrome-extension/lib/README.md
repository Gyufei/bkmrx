# 第三方库

Chrome 扩展无需构建，运行时依赖以压缩文件形式保存在本目录。升级文件时，请同步更新下表中的版本与来源。

| 文件 | 库与版本 | 来源 | 许可证 |
|---|---|---|---|
| `alpine-csp.min.js` | Alpine.js CSP 3.14.8 | [jsDelivr: `@alpinejs/csp@3.14.8/dist/cdn.min.js`](https://cdn.jsdelivr.net/npm/@alpinejs/csp@3.14.8/dist/cdn.min.js) | [MIT](https://github.com/alpinejs/alpine/blob/main/LICENSE.md) |
| `tagify.min.js` | Tagify 4.38.0 | [jsDelivr: `@yaireo/tagify@4.38.0/dist/tagify.js`](https://cdn.jsdelivr.net/npm/@yaireo/tagify@4.38.0/dist/tagify.js) | [MIT](https://github.com/yairEO/tagify/blob/master/LICENSE) |
| `tagify.min.css` | Tagify 4.38.0 | [jsDelivr: `@yaireo/tagify@4.38.0/dist/tagify.css`](https://cdn.jsdelivr.net/npm/@yaireo/tagify@4.38.0/dist/tagify.css) | [MIT](https://github.com/yairEO/tagify/blob/master/LICENSE) |

版本依据：Tagify 的 JS/CSS 文件头标注为 4.38.0；Alpine.js 文件内的 `version` 字段为 3.14.8。
