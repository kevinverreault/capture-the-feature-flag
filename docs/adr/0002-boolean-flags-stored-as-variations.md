# Boolean flags are stored as a list of variations, not a boolean column

V1 only offers on/off flags, but every flag stores an ordered list of variations (boolean flags always have exactly `[true, false]`), and targeting refers to variations by index. Planned features (6-step migration flags with six string variations, progressive rollouts that split traffic between variations) need this shape. Changing from a boolean column later would mean migrating every flag, every snapshot and the Terraform schema.
