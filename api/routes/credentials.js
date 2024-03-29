const express = require('express');
const {CPE2_3_URI} = require('cpe');
const {flattenObject} = require('../util/flatten');

const {Credential} = require('../models/Credentials');

const {
  requiresAdmin,
  requiresKey,
} = require('../middleware/auth');

const router = express.Router();

// TODO: Move to config/constants
const RESULTS_PER_PAGE = 10;

// TODO: Swagger
router.get('/typeahead', (req, res, next) => {
  const {
    field,
    prefix = '',
    count = 5,
    part,
    vendor,
    product,
    version,
    update,
    language,
    edition,
  } = req.query;

  if(!field) res.status(500).send({"message": "The \'field\' parameter is required."});

  const attrs = {
    ...(part && {part: part}),
    ...(vendor && {vendor: vendor}),
    ...(product && {product: product}),
    ...(version && {version: version}),
    ...(update && {update: update}),
    ...(language && {language: language}),
    ...(edition && {edition: edition}),
  };

  const matches = {
    $match: flattenObject({cpe: attrs}),
  };

  Credential.aggregate([
    {
      $facet: {
        "results": [
          matches,
          {
            $group: {
              _id: `$cpe.${field}`,
              count: {$sum: 1}
            }
          },
          {
            $match: {
              _id: {$regex: new RegExp('^' + prefix, 'i')}
            },
          },
          {
            $sort: {
              count: -1
            }
          }
        ]
      }
    }
  ])
    .then((docs) => res.send(docs[0]['results'].slice(0, count)))
    .catch((err) => res.status(500).send({"message": err}));
});

/**
 * @swagger
 * /credentials/search:
 *   post:
 *     description: Returns a list of all known credentials that match a given CPE string.
 *     summary: Get a list of credentials by CPE.
 *     tags:
 *       - Credentials
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *     - name: "body"
 *       in: "body"
 *       description: "The CPE string to query."
 *       required: true
 *       schema:
 *         type: object
 *         properties:
 *           cpe:
 *             type: "string"
 *         example:
 *           cpe: "cpe:/a:linksys:wrt54g"
 *     responses:
 *       200:
 *         description: Returns a list of credentials that match the provided CPE string.
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CredentialsList'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
 router.get('/search', requiresKey, (req, res, next) => {
  const {
    page = 1, 
    limit = RESULTS_PER_PAGE,
    part,
    vendor,
    product,
    version,
    username,
    password,
  } = req.query;
  
  // TODO: Need to revisit this. I don't think this matches the Swagger docs?
  const searchCpe = {
    ...(part && {part, part}),
    ...(vendor && {vendor, vendor}),
    ...(product && {product, product}),
    ...(version && {version, version}),
  };

  const queryFields = {
    cpe: searchCpe,
    ...(username && {username: username}),
    ...(password && {password: password}),
  };

  // TODO: This is not following the schema
  // https://stackoverflow.com/questions/5830513/how-do-i-limit-the-number-of-returned-items
  Credential.paginate(flattenObject(queryFields), {page: page, limit: parseInt(limit)}, (err, docs) => {
    res.send(docs);
  });

});

/**
 * @swagger
 * /credentials/{id}:
 *   get:
 *     summary: Get a credential by ID
 *     description: Returns a credential by ID
 *     tags:
 *       - Credentials
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: false
 *         description: ID of the credential object to fetch
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Returns a single credential object.
 *         schema:
 *           $ref: '#/components/schemas/Credential'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/:id', requiresKey, async (req, res, next) => {
  const {id = ''} = req.params;
  res.send(await Credential.findOne({_id: id}));
});

/**
 * @swagger
 * /credentials:
 *   get:
 *     summary: Get a list of all credentials
 *     description: Returns all credentials stored in the database
 *     tags:
 *       - Credentials
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Returns a list of credential objects.
 *         schema:
 *           $ref: '#/components/schemas/CredentialsList'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', requiresKey, (req, res, next) => {
  const {page = 1, limit = RESULTS_PER_PAGE} = req.query;

  console.log(page, limit);

  Credential.paginate({}, {page: page, limit: parseInt(limit)}, (err, docs) => {
    res.send(docs);
  });
});

/**
 * @swagger
 * /credentials:
 *   post:
 *     summary: Save a new credential
 *     description: Returns a credential by ID
 *     tags:
 *       - Credentials
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *     - name: body
 *       in: body
 *       description: Credential to save
 *       required: true
 *       schema:
 *         $ref: '#/components/schemas/Credential'
 *     responses:
 *       200:
 *         description: Returns the credential object that was saved.
 *         schema:
 *           $ref: '#/components/schemas/Credential'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/', requiresKey, async (req, res, next) => {
  // TODO: More validation/testing
  const credential = new Credential({
    ...req.body
  });

  await credential.save();
  res.send(credential);
});

/**
 * @swagger
 * /credentials/{id}:
 *   put:
 *     summary: Update a credential
 *     description: Returns a credential by ID. Requires Admin.
 *     tags:
 *       - Credentials
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *     - name: id
 *       in: path
 *       description: ID of the credential to update.
 *       required: true
 *       schema:
 *         type: string
 *     - name: details
 *       in: body
 *       description: The Credential details to be updated
 *       schema:
 *         $ref: '#/components/schemas/Credential'
 *     responses:
 *       200:
 *         description: Returns the credential object that was updated.
 *         schema:
 *           $ref: '#/components/schemas/Credential'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put('/:id', requiresAdmin, (req, res, next) => {
  const {id} = req.params;
  const updates = req.body;

  //return res.status(404).send('Not implemented');
  Credential.findByIdAndUpdate(
    id,
    flattenObject(updates),
    {new: true}
  ).then((data) => {
      res.send(data);
    }
  ).catch((err) => {
    res.status(500).send({"message": "Failed to update record"});
  });

  res.send(`OK ${id}`);

});

/**
 * @swagger
 * /credentials/{id}:
 *   delete:
 *     summary: Delete a credential
 *     description: Deletes a credential. Requires Admin.
 *     tags:
 *       - Credentials
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *     - name: id
 *       in: path
 *       description: ID of the credential to delete
 *       required: true
 *     responses:
 *       200:
 *         description: Returns the ID of the credential that was deleted
 *         schema:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               required: true
 *               example: 5
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete('/:id', requiresAdmin, (req, res, next) => {
  const {id} = req.params;

  Credential.deleteOne({_id: id})
    .then(() => {
      res.send({id: id});
    });

});

module.exports = router;