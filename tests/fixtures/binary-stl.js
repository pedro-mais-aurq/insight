export function createBinaryStlFixture() {
  const buffer = new ArrayBuffer(84 + 50);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true);
  const values = [
    0, 0, 1,
    0, 0, 0,
    1, 0, 0,
    0, 1, 0
  ];

  values.forEach((value, index) => {
    view.setFloat32(84 + index * 4, value, true);
  });
  view.setUint16(84 + 48, 0, true);
  return buffer;
}
