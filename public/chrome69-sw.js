/* Runs inside the service worker, which does not see the page polyfills. */
if (typeof Promise.allSettled !== "function") {
  Promise.allSettled = function (items) {
    return Promise.all(
      Array.prototype.map.call(items, function (item) {
        return Promise.resolve(item).then(
          function (value) {
            return { status: "fulfilled", value: value };
          },
          function (reason) {
            return { status: "rejected", reason: reason };
          },
        );
      }),
    );
  };
}
