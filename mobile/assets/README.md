# Background texture

`grain.png` and `grain@3x.png` render the exact 200 × 200 SVG noise tile from
`#root::before` in `src/index.css`. They retain the filter's alpha channel;
flattening against white changes the dark background even at low opacity.
The 600 × 600 variant represents the same 200 logical pixels at density 3.
Use both at the web opacity, `0.024`.

To regenerate in a browser on the running web app:

```js
const source = getComputedStyle(document.querySelector('#root'), '::before')
  .backgroundImage.slice(5, -2)
const image = new Image()
image.src = source
await image.decode()
for (const scale of [1, 3]) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 200 * scale
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  // Save this data URL as grain.png (1) or grain@3x.png (3), without flattening.
  console.log(scale, canvas.toDataURL('image/png'))
}
```

The mobile web breakpoint hides the body grid. Its opaque auth shell also
covers the global grain, so only the workout surface uses this texture.
